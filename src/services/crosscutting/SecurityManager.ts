import { 
    IEventBus, 
    ISecurityManager, 
    SecurityContext, 
    SecurityValidationResult, 
    SecurityEvent, 
    SecurityMetrics, 
    SecurityPolicy 
} from '../interfaces';

/**
 * Centralized Security Manager
 * 
 * Provides comprehensive security services including:
 * - Input validation and sanitization
 * - Output sanitization for safe display
 * - Permission checking and authorization
 * - Security event auditing and monitoring
 * - Threat detection and risk assessment
 * - Configurable security policies
 */
export class SecurityManager implements ISecurityManager {
    private policy: SecurityPolicy;
    private events: SecurityEvent[] = [];
    private maxEvents: number = 1000;
    private validationStats: Map<string, number> = new Map();
    private permissionStats: Map<string, number> = new Map();
    private threatPatterns: Map<string, RegExp> = new Map();
    
    constructor(
        private eventBus: IEventBus,
        policy?: Partial<SecurityPolicy>
    ) {
        this.policy = {
            allowedOperations: ['read', 'write', 'execute', 'list'],
            restrictedPatterns: [
                'eval\\s*\\(',
                'Function\\s*\\(',
                'setTimeout\\s*\\(',
                'setInterval\\s*\\(',
                '<script[^>]*>',
                'javascript:',
                'data:text/html',
                'vbscript:',
                'file://',
                '\\.\\./\\.\\./',
                '\\$\\{[^}]*\\}',
                '<%[^%]*%>'
            ],
            maxInputLength: 10000,
            requiresPermission: ['file_access', 'network_request', 'system_command'],
            auditAll: false,
            ...policy
        };
        
        this.initializeThreatPatterns();
        this.setupEventListeners();
    }

    /**
     * Validates input for security threats and policy compliance.
     */
    validateInput(input: string, context: SecurityContext): SecurityValidationResult {
        const startTime = Date.now();
        const threats: string[] = [];
        let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
        let sanitizedInput = input;

        try {
            // Check input length
            if (input.length > this.policy.maxInputLength) {
                threats.push(`Input exceeds maximum length (${this.policy.maxInputLength})`);
                riskLevel = this.escalateRisk(riskLevel, 'medium');
            }

            // Check for restricted patterns
            for (const pattern of this.policy.restrictedPatterns) {
                const regex = new RegExp(pattern, 'gi');
                if (regex.test(input)) {
                    threats.push(`Matches restricted pattern: ${pattern}`);
                    riskLevel = this.escalateRisk(riskLevel, 'high');
                    
                    // Remove or replace dangerous patterns
                    sanitizedInput = sanitizedInput.replace(regex, '[REMOVED]');
                }
            }

            // Check for common injection patterns
            const injectionThreats = this.detectInjectionThreats(input);
            threats.push(...injectionThreats.threats);
            riskLevel = this.escalateRisk(riskLevel, injectionThreats.riskLevel);
            if (injectionThreats.sanitized) {
                sanitizedInput = injectionThreats.sanitized;
            }

            // Check for suspicious file paths
            const pathThreats = this.detectPathTraversal(input);
            threats.push(...pathThreats.threats);
            riskLevel = this.escalateRisk(riskLevel, pathThreats.riskLevel);

            // Check for encoded threats
            const encodingThreats = this.detectEncodingThreats(input);
            threats.push(...encodingThreats.threats);
            riskLevel = this.escalateRisk(riskLevel, encodingThreats.riskLevel);

            // Update statistics
            this.updateValidationStats(context.operation, threats.length > 0);
            
            // Create validation result
            const result: SecurityValidationResult = {
                isValid: threats.length === 0,
                threats,
                sanitizedInput: threats.length > 0 ? sanitizedInput : undefined,
                riskLevel
            };

            // Audit the validation
            this.auditValidation(context, input, result, Date.now() - startTime);

            return result;

        } catch (error) {
            const errorResult: SecurityValidationResult = {
                isValid: false,
                threats: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
                riskLevel: 'critical'
            };

            this.auditLog({
                type: 'validation',
                timestamp: Date.now(),
                context,
                details: {
                    error: error instanceof Error ? error.message : String(error),
                    input: input.substring(0, 100) + (input.length > 100 ? '...' : '')
                },
                severity: 'critical'
            });

            return errorResult;
        }
    }

    /**
     * Sanitizes output for safe display.
     */
    sanitizeOutput(output: string, context: SecurityContext): string {
        let sanitized = output;

        try {
            // Skip HTML escaping for tool outputs to preserve code/diff formatting
            const isToolOutput = context.operation === 'sanitize_tool_output' || 
                                context.source?.startsWith('tool_');
            
            if (!isToolOutput) {
                // HTML encode dangerous characters only for non-tool outputs
                sanitized = sanitized
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#x27;')
                    .replace(/\//g, '&#x2F;');
            }

            // Always remove or escape potentially dangerous URLs (regardless of context)
            sanitized = sanitized.replace(
                /(javascript|vbscript|data):[^"'\s>]*/gi,
                '[UNSAFE_URL_REMOVED]'
            );

            // Always remove suspicious script-like content (regardless of context)
            sanitized = sanitized.replace(
                /<script[^>]*>.*?<\/script>/gis,
                '[SCRIPT_REMOVED]'
            );

            // Audit the sanitization
            if (sanitized !== output) {
                this.auditLog({
                    type: 'validation',
                    timestamp: Date.now(),
                    context,
                    details: {
                        operation: 'output_sanitization',
                        changesApplied: true,
                        originalLength: output.length,
                        sanitizedLength: sanitized.length,
                        skipHtmlEscaping: isToolOutput
                    },
                    severity: 'info'
                });
            }

            return sanitized;

        } catch (error) {
            this.auditLog({
                type: 'validation',
                timestamp: Date.now(),
                context,
                details: {
                    error: error instanceof Error ? error.message : String(error),
                    operation: 'output_sanitization_failed'
                },
                severity: 'error'
            });

            // Return heavily sanitized version on error
            return output.replace(/[<>&"']/g, '?');
        }
    }

    /**
     * Checks if an operation is permitted in the given context.
     */
    checkPermissions(operation: string, context: SecurityContext): boolean {
        try {
            // Check if operation is in allowed list
            if (!this.policy.allowedOperations.includes(operation)) {
                this.auditPermissionCheck(operation, context, false, 'Operation not in allowed list');
                return false;
            }

            // Check if operation requires special permission
            if (this.policy.requiresPermission.includes(operation)) {
                // For now, require explicit user context for sensitive operations
                if (!context.user || context.source === 'automated') {
                    this.auditPermissionCheck(operation, context, false, 'Requires user authorization');
                    return false;
                }
            }

            // Check context-specific restrictions
            if (context.source === 'untrusted' && this.isSensitiveOperation(operation)) {
                this.auditPermissionCheck(operation, context, false, 'Untrusted source attempting sensitive operation');
                return false;
            }

            this.auditPermissionCheck(operation, context, true, 'Permission granted');
            return true;

        } catch (error) {
            this.auditLog({
                type: 'permission_check',
                timestamp: Date.now(),
                context,
                details: {
                    operation,
                    error: error instanceof Error ? error.message : String(error)
                },
                severity: 'error'
            });
            
            // Fail securely - deny on error
            return false;
        }
    }

    /**
     * Logs a security event for auditing.
     */
    auditLog(event: SecurityEvent): void {
        this.events.push(event);
        
        // Cleanup old events
        if (this.events.length > this.maxEvents) {
            this.events = this.events.slice(-this.maxEvents);
        }

        // Publish to event bus
        this.eventBus.publish('security.event_logged', {
            event,
            timestamp: Date.now()
        });

        // Alert on high-severity events
        if (event.severity === 'critical' || event.severity === 'error') {
            this.eventBus.publish('security.alert', {
                event,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Gets security metrics and statistics.
     */
    getSecurityMetrics(): SecurityMetrics {
        const recentEvents = this.events.filter(event => 
            Date.now() - event.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
        );

        const validationResults: Record<string, number> = {};
        this.validationStats.forEach((count, key) => {
            validationResults[key] = count;
        });

        const permissionChecks: Record<string, number> = {};
        this.permissionStats.forEach((count, key) => {
            permissionChecks[key] = count;
        });

        return {
            validationResults,
            permissionChecks,
            suspiciousActivities: recentEvents.filter(e => 
                e.type === 'suspicious_activity'
            ).length,
            policyViolations: recentEvents.filter(e => 
                e.type === 'policy_violation'
            ).length,
            recentEvents: recentEvents.slice(-50) // Last 50 events
        };
    }

    /**
     * Updates the security policy.
     */
    updateSecurityPolicy(policy: SecurityPolicy): void {
        const oldPolicy = { ...this.policy };
        this.policy = { ...policy };
        
        // Reinitialize threat patterns
        this.initializeThreatPatterns();
        
        this.auditLog({
            type: 'policy_violation',
            timestamp: Date.now(),
            context: {
                operation: 'policy_update',
                source: 'system',
                metadata: { oldPolicy, newPolicy: policy }
            },
            details: {
                operation: 'security_policy_updated',
                changes: this.compareSecurityPolicies(oldPolicy, policy)
            },
            severity: 'info'
        });
    }

    /**
     * Initializes threat detection patterns.
     */
    private initializeThreatPatterns(): void {
        this.threatPatterns.clear();
        
        // Add common threat patterns
        this.threatPatterns.set('sql_injection', /(union\s+select|insert\s+into|delete\s+from|drop\s+table|exec\s*\(|execute\s*\()/gi);
        this.threatPatterns.set('xss', /(<script[^>]*>|javascript:|vbscript:|onload=|onerror=|onclick=)/gi);
        this.threatPatterns.set('path_traversal', /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\\)/gi);
        this.threatPatterns.set('command_injection', /(\||;|&|`|\$\{|exec|system|eval)/gi);
        this.threatPatterns.set('template_injection', /(\{\{|\}\}|<%|%>|\${|\})/gi);
    }

    /**
     * Detects injection threats in input.
     */
    private detectInjectionThreats(input: string): {
        threats: string[];
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
        sanitized?: string;
    } {
        const threats: string[] = [];
        let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
        let sanitized = input;

        this.threatPatterns.forEach((pattern, threatType) => {
            if (pattern.test(input)) {
                threats.push(`Potential ${threatType.replace('_', ' ')} detected`);
                riskLevel = this.escalateRisk(riskLevel, 'high');
                
                // Apply basic sanitization
                sanitized = sanitized.replace(pattern, '[THREAT_REMOVED]');
            }
        });

        return { threats, riskLevel, sanitized: threats.length > 0 ? sanitized : undefined };
    }

    /**
     * Detects path traversal attempts.
     */
    private detectPathTraversal(input: string): {
        threats: string[];
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
    } {
        const threats: string[] = [];
        let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

        // Check for various path traversal patterns
        const pathPatterns = [
            /\.\.[\/\\]/g,
            /%2e%2e[%2f%5c]/gi,
            /\.\.[%2f%5c]/gi,
            /%2e%2e[\/\\]/gi
        ];

        pathPatterns.forEach(pattern => {
            if (pattern.test(input)) {
                threats.push('Path traversal attempt detected');
                riskLevel = this.escalateRisk(riskLevel, 'high');
            }
        });

        return { threats, riskLevel };
    }

    /**
     * Detects encoding-based threats.
     */
    private detectEncodingThreats(input: string): {
        threats: string[];
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
    } {
        const threats: string[] = [];
        let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

        try {
            // Decode URL encoding and check for threats
            const decoded = decodeURIComponent(input);
            if (decoded !== input) {
                // Check if decoded version contains threats
                this.threatPatterns.forEach((pattern, threatType) => {
                    if (pattern.test(decoded)) {
                        threats.push(`URL-encoded ${threatType.replace('_', ' ')} detected`);
                        riskLevel = this.escalateRisk(riskLevel, 'medium');
                    }
                });
            }
        } catch (error) {
            // Invalid URL encoding might be an attempt to bypass filters
            threats.push('Invalid URL encoding detected');
            riskLevel = this.escalateRisk(riskLevel, 'medium');
        }

        return { threats, riskLevel };
    }

    /**
     * Escalates risk level to the higher of current or new level.
     */
    private escalateRisk(
        current: 'low' | 'medium' | 'high' | 'critical',
        newLevel: 'low' | 'medium' | 'high' | 'critical'
    ): 'low' | 'medium' | 'high' | 'critical' {
        const levels = ['low', 'medium', 'high', 'critical'];
        const currentIndex = levels.indexOf(current);
        const newIndex = levels.indexOf(newLevel);
        return levels[Math.max(currentIndex, newIndex)] as 'low' | 'medium' | 'high' | 'critical';
    }

    /**
     * Checks if an operation is considered sensitive.
     */
    private isSensitiveOperation(operation: string): boolean {
        const sensitiveOps = [
            'file_access',
            'network_request',
            'system_command',
            'execute',
            'admin_action'
        ];
        return sensitiveOps.includes(operation);
    }

    /**
     * Updates validation statistics.
     */
    private updateValidationStats(operation: string, hasThreats: boolean): void {
        const key = `${operation}_${hasThreats ? 'threats' : 'clean'}`;
        this.validationStats.set(key, (this.validationStats.get(key) || 0) + 1);
    }

    /**
     * Audits a validation operation.
     */
    private auditValidation(
        context: SecurityContext, 
        input: string, 
        result: SecurityValidationResult, 
        duration: number
    ): void {
        if (this.policy.auditAll || result.threats.length > 0) {
            this.auditLog({
                type: 'validation',
                timestamp: Date.now(),
                context,
                details: {
                    inputLength: input.length,
                    threatCount: result.threats.length,
                    riskLevel: result.riskLevel,
                    duration,
                    threats: result.threats
                },
                severity: result.riskLevel === 'critical' ? 'critical' : 
                         result.riskLevel === 'high' ? 'error' :
                         result.riskLevel === 'medium' ? 'warn' : 'info'
            });
        }
    }

    /**
     * Audits a permission check.
     */
    private auditPermissionCheck(
        operation: string, 
        context: SecurityContext, 
        granted: boolean, 
        reason: string
    ): void {
        const key = `${operation}_${granted ? 'granted' : 'denied'}`;
        this.permissionStats.set(key, (this.permissionStats.get(key) || 0) + 1);

        this.auditLog({
            type: 'permission_check',
            timestamp: Date.now(),
            context,
            details: {
                operation,
                granted,
                reason
            },
            severity: granted ? 'info' : 'warn'
        });
    }

    /**
     * Compares two security policies for changes.
     */
    private compareSecurityPolicies(oldPolicy: SecurityPolicy, newPolicy: SecurityPolicy): string[] {
        const changes: string[] = [];
        
        if (oldPolicy.maxInputLength !== newPolicy.maxInputLength) {
            changes.push(`Max input length: ${oldPolicy.maxInputLength} → ${newPolicy.maxInputLength}`);
        }
        
        if (oldPolicy.auditAll !== newPolicy.auditAll) {
            changes.push(`Audit all: ${oldPolicy.auditAll} → ${newPolicy.auditAll}`);
        }
        
        if (JSON.stringify(oldPolicy.allowedOperations) !== JSON.stringify(newPolicy.allowedOperations)) {
            changes.push('Allowed operations updated');
        }
        
        if (JSON.stringify(oldPolicy.restrictedPatterns) !== JSON.stringify(newPolicy.restrictedPatterns)) {
            changes.push('Restricted patterns updated');
        }
        
        return changes;
    }

    /**
     * Sets up event listeners for security monitoring.
     */
    private setupEventListeners(): void {
        // Monitor for suspicious patterns in agent communications
        this.eventBus.subscribe('agent.*', (data: any) => {
            if (data.content && typeof data.content === 'string') {
                const validation = this.validateInput(data.content, {
                    operation: 'agent_communication',
                    source: 'agent',
                    metadata: { eventType: 'agent_activity' }
                });
                
                if (validation.riskLevel === 'high' || validation.riskLevel === 'critical') {
                    this.auditLog({
                        type: 'suspicious_activity',
                        timestamp: Date.now(),
                        context: {
                            operation: 'agent_communication',
                            source: 'agent',
                            metadata: data
                        },
                        details: {
                            threats: validation.threats,
                            riskLevel: validation.riskLevel
                        },
                        severity: validation.riskLevel === 'critical' ? 'critical' : 'error'
                    });
                }
            }
        });

        // Monitor tool executions for security implications
        this.eventBus.subscribe('tool.*', (data: any) => {
            if (data.command && this.isSensitiveOperation(data.command.action)) {
                this.auditLog({
                    type: 'permission_check',
                    timestamp: Date.now(),
                    context: {
                        operation: data.command.action,
                        source: 'tool_execution',
                        metadata: data
                    },
                    details: {
                        toolAction: data.command.action,
                        automated: true
                    },
                    severity: 'info'
                });
            }
        });
    }
}
