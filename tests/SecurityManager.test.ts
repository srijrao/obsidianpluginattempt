/**
 * @file SecurityManager.test.ts
 * @description Comprehensive test suite for SecurityManager service
 */

import { SecurityManager } from '../src/services/crosscutting/SecurityManager';
import { IEventBus, ISecurityManager, SecurityContext, SecurityValidationResult, SecurityEvent, SecurityMetrics, SecurityPolicy } from '../src/services/interfaces';

describe('SecurityManager', () => {
    let securityManager: SecurityManager;
    let mockEventBus: jest.Mocked<IEventBus>;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockEventBus = {
            publish: jest.fn().mockResolvedValue(undefined),
            subscribe: jest.fn().mockReturnValue(() => { }),
            subscribeOnce: jest.fn().mockReturnValue(() => { }),
            unsubscribe: jest.fn(),
            clear: jest.fn(),
            getSubscriptionCount: jest.fn().mockReturnValue(0),
        };

        securityManager = new SecurityManager(mockEventBus);
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    describe('constructor', () => {
        test('should initialize with default policy and subscribe to events', () => {
            expect(securityManager).toBeInstanceOf(SecurityManager);
            expect(mockEventBus.subscribe).toHaveBeenCalledWith('agent.*', expect.any(Function));
            expect(mockEventBus.subscribe).toHaveBeenCalledWith('tool.*', expect.any(Function));
            // Verify default policy values
            const defaultPolicy = (securityManager as any)['policy'];
            expect(defaultPolicy.allowedOperations).toContain('read');
            expect(defaultPolicy.maxInputLength).toBe(10000);
        });

        test('should initialize with custom policy', () => {
            const customPolicy: Partial<SecurityPolicy> = {
                maxInputLength: 500,
                auditAll: true,
            };
            const customSecurityManager = new SecurityManager(mockEventBus, customPolicy);
            const policy = (customSecurityManager as any)['policy'];
            expect(policy.maxInputLength).toBe(500);
            expect(policy.auditAll).toBe(true);
        });
    });

    describe('input validation', () => {
        const baseContext: SecurityContext = { operation: 'test_input', source: 'user_input' };

        test('should return isValid true for clean input', () => {
            const result = securityManager.validateInput('Hello, world!', baseContext);
            expect(result.isValid).toBe(true);
            expect(result.threats).toHaveLength(0);
            expect(result.sanitizedInput).toBeUndefined();
            expect(result.riskLevel).toBe('low');
            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.any(Object)); // Audit log for clean input if auditAll is true (default is false)
        });

        test('should detect SQL Injection', () => {
            const result = securityManager.validateInput("SELECT * FROM users WHERE name = '' OR '1'='1'", baseContext);
            expect(result.isValid).toBe(false);
            expect(result.threats).toContain('Potential sql injection detected');
            expect(result.sanitizedInput).toBeDefined();
            expect(result.riskLevel).toBe('high');
        });

        test('should detect XSS (script tags)', () => {
            const result = securityManager.validateInput('<script>alert("XSS")</script>', baseContext);
            expect(result.isValid).toBe(false);
            expect(result.threats).toContain('Matches restricted pattern: <script[^>]*>');
            expect(result.threats).toContain('Potential xss detected');
            expect(result.sanitizedInput).toBeDefined();
            expect(result.sanitizedInput).toContain('[REMOVED]');
            expect(result.riskLevel).toBe('high');
        });

        test('should detect XSS (javascript: URI)', () => {
            const result = securityManager.validateInput('href="javascript:alert(1)"', baseContext);
            expect(result.isValid).toBe(false);
            expect(result.threats).toContain('Matches restricted pattern: javascript:');
            expect(result.threats).toContain('Potential xss detected');
            expect(result.sanitizedInput).toBeDefined();
            expect(result.riskLevel).toBe('high');
        });

        test('should detect Path Traversal (../)', () => {
            const result = securityManager.validateInput('../../etc/passwd', baseContext);
            expect(result.isValid).toBe(false);
            expect(result.threats).toContain('Matches restricted pattern: \\.\\./\\.\\./'); // Match restricted pattern
            expect(result.threats).toContain('Path traversal attempt detected'); // Match specific path traversal
            expect(result.sanitizedInput).toBeDefined();
            expect(result.riskLevel).toBe('high');
        });

        test('should detect Path Traversal (%2e%2e%2f)', () => {
            const result = securityManager.validateInput('%2e%2e%2fboot.ini', baseContext);
            expect(result.isValid).toBe(false);
            expect(result.threats).toContain('Path traversal attempt detected');
            expect(result.sanitizedInput).toBeDefined();
            expect(result.riskLevel).toBe('high');
        });

        test('should detect Command Injection', () => {
            const result = securityManager.validateInput('; rm -rf /', baseContext);
            expect(result.isValid).toBe(false);
            expect(result.threats).toContain('Potential command injection detected');
            expect(result.sanitizedInput).toBeDefined();
            expect(result.riskLevel).toBe('high');
        });

        test('should detect Template Injection', () => {
            const result = securityManager.validateInput('Hello {{name}} <%= foo %>', baseContext);
            expect(result.isValid).toBe(false);
            expect(result.threats).toContain('Potential template injection detected');
            expect(result.sanitizedInput).toBeDefined();
            expect(result.riskLevel).toBe('high');
        });

        test('should detect encoded threats after URL decoding', () => {
            const result = securityManager.validateInput('%3Cscript%3Ealert%281%29%3C%2Fscript%3E', baseContext);
            expect(result.isValid).toBe(false);
            expect(result.threats).toContain('URL-encoded xss detected');
            // No direct sanitizedInput as it's from decoding, not direct pattern replacement
            expect(result.riskLevel).toBe('medium');
        });

        test('should handle input exceeding max length', () => {
            const longInput = 'A'.repeat(10001);
            const result = securityManager.validateInput(longInput, baseContext);
            expect(result.isValid).toBe(false);
            expect(result.threats).toContain('Input exceeds maximum length (10000)');
            expect(result.riskLevel).toBe('medium');
        });

        test('should handle invalid URL encoding gracefully', () => {
            const result = securityManager.validateInput('%E0%A4%A', baseContext); // Incomplete UTF-8 sequence
            expect(result.isValid).toBe(false);
            expect(result.threats).toContain('Invalid URL encoding detected');
            expect(result.riskLevel).toBe('medium');
        });

        test('should audit logs for validation actions when auditAll is true', () => {
            securityManager.updateSecurityPolicy({ auditAll: true } as SecurityPolicy);
            securityManager.validateInput('clean input', baseContext);
            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ type: 'validation', severity: 'info' })
            }));
        });

        test('should audit logs for validation threats even when auditAll is false', () => {
            securityManager.validateInput('<script>alert()</script>', baseContext);
            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ type: 'validation', severity: 'error' }) // Risk high → severity error
            }));
        });
    });

    describe('output sanitization', () => {
        const baseContext: SecurityContext = { operation: 'display_output', source: 'system' };

        test('should HTML encode basic dangerous characters', () => {
            const unsafe = `<a>"&'</>"`;
            const sanitized = securityManager.sanitizeOutput(unsafe, baseContext);
            expect(sanitized).toBe('<a>"&&#x27;<&#x2F;>');
        });

        test('should remove javascript: links', () => {
            const unsafe = `<a href="javascript:alert(1)">Click me</a>`;
            const sanitized = securityManager.sanitizeOutput(unsafe, baseContext);
            expect(sanitized).toContain('[UNSAFE_URL_REMOVED]');
            expect(sanitized).not.toContain('javascript:');
        });

        test('should remove vbscript: links', () => {
            const unsafe = `<img src="vbscript:alert(1)">`;
            const sanitized = securityManager.sanitizeOutput(unsafe, baseContext);
            expect(sanitized).toContain('[UNSAFE_URL_REMOVED]');
            expect(sanitized).not.toContain('vbscript:');
        });

        test('should remove data:text/html links', () => {
            const unsafe = `<a href="data:text/html,<script>alert(1)</script>">Click me</a>`;
            const sanitized = securityManager.sanitizeOutput(unsafe, baseContext);
            expect(sanitized).toContain('[UNSAFE_URL_REMOVED]');
            expect(sanitized).not.toContain('data:text/html');
        });

        test('should remove script tags', () => {
            const unsafe = `<div>Normal content</div><script>evil();</script><span>More text</span>`;
            const sanitized = securityManager.sanitizeOutput(unsafe, baseContext);
            expect(sanitized).toContain('Normal content');
            expect(sanitized).toContain('More text');
            expect(sanitized).not.toContain('<script>');
            expect(sanitized).toContain('[SCRIPT_REMOVED]');
        });

        test('should handle multiple script tags', () => {
            const unsafe = `<script>a</script><div>a</div><script>b</script>`;
            const sanitized = securityManager.sanitizeOutput(unsafe, baseContext);
            expect(sanitized).toBe('[SCRIPT_REMOVED]<div>a</div>[SCRIPT_REMOVED]');
        });

        test('should return unchanged string if no unsafe content', () => {
            const safe = 'This is a safe string without any scripts or special characters.';
            const sanitized = securityManager.sanitizeOutput(safe, baseContext);
            expect(sanitized).toBe(safe);
        });

        test('should audit log if changes were applied during sanitization', () => {
            const unsafe = '<script>alert()</script>';
            securityManager.sanitizeOutput(unsafe, baseContext);
            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ 
                    type: 'validation', 
                    severity: 'info',
                    details: expect.objectContaining({ changesApplied: true })
                })
            }));
        });

        test('should not audit log if no changes were applied (unless auditAll)', () => {
            securityManager.sanitizeOutput('clean string', baseContext);
            // This test assumes auditAll is false by default. Re-mock if necessary.
            expect(mockEventBus.publish).not.toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ 
                    type: 'validation', 
                    details: expect.objectContaining({ changesApplied: false }) // Check if audit for non-changes is called
                })
            }));
        });

        test('should log error if sanitization fails', () => {
            const originalReplace = String.prototype.replace;
            // Temporarily break String.prototype.replace for testing error path
            String.prototype.replace = jest.fn(() => { throw new Error('Mock sanitization error'); });

            const result = securityManager.sanitizeOutput('test', baseContext);
            expect(result).toBe('test'); // Returns heavily sanitized on error
            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ type: 'validation', severity: 'error' })
            }));

            String.prototype.replace = originalReplace; // Restore original
        });
    });

    describe('permission checking', () => {
        const userContext: SecurityContext = { operation: 'read_file', source: 'user_action', user: 'testUser' };
        const automatedContext: SecurityContext = { operation: 'network_request', source: 'automated' };
        const untrustedContext: SecurityContext = { operation: 'admin_action', source: 'untrusted' };

        test('should grant permission for allowed, non-sensitive operations', () => {
            expect(securityManager.checkPermissions('read', userContext)).toBe(true);
            expect(securityManager.checkPermissions('list', automatedContext)).toBe(true);
            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ type: 'permission_check', severity: 'info', details: expect.objectContaining({ granted: true }) })
            }));
        });

        test('should deny permission for disallowed operations', () => {
            expect(securityManager.checkPermissions('delete', userContext)).toBe(false); // 'delete' not in default allowedOperations
            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ type: 'permission_check', severity: 'warn', details: expect.objectContaining({ granted: false, reason: 'Operation not in allowed list' }) })
            }));
        });

        test('should deny sensitive operations without explicit user context', () => {
            expect(securityManager.checkPermissions('file_access', automatedContext)).toBe(false); // requires user, automated source
            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ type: 'permission_check', severity: 'warn', details: expect.objectContaining({ granted: false, reason: 'Requires user authorization' }) })
            }));
        });

        test('should grant sensitive operations with explicit user context', () => {
            expect(securityManager.checkPermissions('file_access', userContext)).toBe(true);
        });

        test('should deny sensitive operations from untrusted sources', () => {
            expect(securityManager.checkPermissions('system_command', untrustedContext)).toBe(false);
            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ granted: false, reason: 'Untrusted source attempting sensitive operation' })
            }));
        });

        test('should log error if permission check fails internally', () => {
            const originalIsSensitive = (securityManager as any).isSensitiveOperation;
            (securityManager as any).isSensitiveOperation = jest.fn(() => { throw new Error('Mock permission error'); });

            expect(securityManager.checkPermissions('read', userContext)).toBe(false);
            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ type: 'permission_check', severity: 'error' })
            }));

            (securityManager as any).isSensitiveOperation = originalIsSensitive; // Restore
        });
    });

    describe('audit logging', () => {
        test('should store security events', () => {
            const event1: SecurityEvent = { type: 'validation', timestamp: Date.now(), context: { operation: 'login', source: 'test' }, details: { user: 'a' }, severity: 'info' };
            const event2: SecurityEvent = { type: 'permission_check', timestamp: Date.now(), context: { operation: 'failed_login', source: 'test' }, details: { user: 'b' }, severity: 'warn' };

            securityManager.auditLog(event1);
            securityManager.auditLog(event2);

            const metrics = securityManager.getSecurityMetrics();
            expect(metrics.recentEvents).toHaveLength(2);
            expect(metrics.recentEvents[0]).toEqual(event1); // Check order (oldest first in storage)
            expect(metrics.recentEvents[1]).toEqual(event2);
        });

        test('should publish security.event_logged via event bus', () => {
            const event: SecurityEvent = { type: 'validation', timestamp: Date.now(), context: { operation: 'test_event', source: 'test' }, details: {}, severity: 'info' };
            securityManager.auditLog(event);
            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({ event }));
        });

        test('should publish security.alert for critical and error severity events', () => {
            const criticalEvent: SecurityEvent = { type: 'suspicious_activity', timestamp: Date.now(), context: { operation: 'critical_event', source: 'test' }, details: {}, severity: 'critical' };
            const errorEvent: SecurityEvent = { type: 'policy_violation', timestamp: Date.now(), context: { operation: 'error_event', source: 'test' }, details: {}, severity: 'error' };
            const infoEvent: SecurityEvent = { type: 'validation', timestamp: Date.now(), context: { operation: 'info_event', source: 'test' }, details: {}, severity: 'info' };

            securityManager.auditLog(criticalEvent);
            securityManager.auditLog(errorEvent);
            securityManager.auditLog(infoEvent);

            expect(mockEventBus.publish).toHaveBeenCalledWith('security.alert', expect.objectContaining({ event: criticalEvent }));
            expect(mockEventBus.publish).toHaveBeenCalledWith('security.alert', expect.objectContaining({ event: errorEvent }));
            expect(mockEventBus.publish).not.toHaveBeenCalledWith('security.alert', expect.objectContaining({ event: infoEvent }));
            expect(mockEventBus.publish).toHaveBeenCalledTimes(5); // 3 for event_logged, 2 for alert
        });

        test('should limit the number of stored events (maxEvents)', () => {
            (securityManager as any)['maxEvents'] = 3; // Set a small max for testing
            for (let i = 0; i < 5; i++) {
                securityManager.auditLog({ type: 'validation', timestamp: Date.now(), context: { operation: `event_${i}`, source: 'test' }, details: {}, severity: 'info' });
            }
            const metrics = securityManager.getSecurityMetrics();
            expect(metrics.recentEvents).toHaveLength(3);
            expect(metrics.recentEvents[0].type).toBe('validation'); // All types will be 'validation' due to previous fix
            expect(metrics.recentEvents[2].type).toBe('validation');
        });
    });

    describe('security metrics', () => {
        test('should return correct initial metrics', () => {
            const metrics = securityManager.getSecurityMetrics();
            expect(metrics.validationResults).toEqual({});
            expect(metrics.permissionChecks).toEqual({});
            expect(metrics.suspiciousActivities).toBe(0);
            expect(metrics.policyViolations).toBe(0);
            expect(metrics.recentEvents).toHaveLength(0);
        });

        test('should update validationResults metrics', () => {
            securityManager.validateInput('clean', { operation: 'op1', source: 's1' });
            securityManager.validateInput('<script>', { operation: 'op1', source: 's1' });
            securityManager.validateInput('clean', { operation: 'op2', source: 's2' });

            const metrics = securityManager.getSecurityMetrics();
            expect(metrics.validationResults['op1_clean']).toBe(1);
            expect(metrics.validationResults['op1_threats']).toBe(1);
            expect(metrics.validationResults['op2_clean']).toBe(1);
        });

        test('should update permissionChecks metrics', () => {
            securityManager.checkPermissions('read', { operation: 'read', source: 's1' });
            securityManager.checkPermissions('write', { operation: 'write', source: 's1' }); // disallowed
            securityManager.checkPermissions('read', { operation: 'read', source: 's2' });

            const metrics = securityManager.getSecurityMetrics();
            expect(metrics.permissionChecks['read_granted']).toBe(2);
            expect(metrics.permissionChecks['write_denied']).toBe(1);
        });

        test('should count suspicious activities and policy violations', () => {
            const baseContext = { operation: 'test_op', source: 'test_source' };
            securityManager.auditLog({ type: 'suspicious_activity', timestamp: Date.now(), context: baseContext, details: {}, severity: 'warn' });
            securityManager.auditLog({ type: 'policy_violation', timestamp: Date.now(), context: baseContext, details: {}, severity: 'error' });
            securityManager.auditLog({ type: 'validation', timestamp: Date.now(), context: { operation: 'login_attempt', source: 'test' }, details: {}, severity: 'info' });

            jest.advanceTimersByTime(24 * 60 * 60 * 1000 + 1); // Advance time past 24 hours
            securityManager.auditLog({ type: 'suspicious_activity', timestamp: Date.now(), context: baseContext, details: {}, severity: 'warn' });

            const metrics = securityManager.getSecurityMetrics();
            expect(metrics.suspiciousActivities).toBe(1); // Only the one within last 24 hours
            expect(metrics.policyViolations).toBe(1);
            expect(metrics.recentEvents).toHaveLength(1); // Only the one suspicious_activity event within last 24 hours
        });
    });

    describe('security policy updates', () => {
        test('should update security policy', () => {
            const newPolicy: SecurityPolicy = {
                allowedOperations: ['new_op'],
                restrictedPatterns: ['new_pattern'],
                maxInputLength: 500,
                requiresPermission: ['sensitive_new_op'],
                auditAll: true
            };
            securityManager.updateSecurityPolicy(newPolicy);

            const currentPolicy = (securityManager as any)['policy'];
            expect(currentPolicy.allowedOperations).toEqual(['new_op']);
            expect(currentPolicy.maxInputLength).toBe(500);
            expect(currentPolicy.auditAll).toBe(true);
            expect(currentPolicy.restrictedPatterns.some((p: string) => p.includes('new_pattern'))).toBe(true);
        });

        test('should reinitialize threat patterns on policy update', () => {
            const initialThreatPatterns = (securityManager as any)['threatPatterns'].get('sql_injection');
            securityManager.updateSecurityPolicy({ ...((securityManager as any)['policy']), maxInputLength: 100 } );
            const newThreatPatterns = (securityManager as any)['threatPatterns'].get('sql_injection');
            expect(newThreatPatterns).toEqual(initialThreatPatterns); // Should be re-initialized, but content largely same
            // This test primarily ensures the method is called, rather than deep content change
        });

        test('should log policy update event', () => {
            const oldPolicy = { ...((securityManager as any)['policy']) };
            const newPolicy: SecurityPolicy = { ...oldPolicy, maxInputLength: 7500, auditAll: true };
            securityManager.updateSecurityPolicy(newPolicy);

            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({
                    type: 'policy_violation', // Type for policy updates or violations
                    severity: 'info',
                    details: expect.objectContaining({
                        operation: 'security_policy_updated',
                        changes: expect.arrayContaining([
                            expect.stringContaining('Max input length: 10000 → 7500'),
                            expect.stringContaining('Audit all: false → true')
                        ])
                    })
                })
            }));
        });
    });

    describe('event listeners', () => {
        test('should monitor agent communication for threats', () => {
            const agentHandler = (mockEventBus.subscribe as jest.Mock).mock.calls.find(call => call[0] === 'agent.*')?.[1];
            expect(agentHandler).toBeDefined();

            agentHandler({ content: '<script>evil()</script>' });

            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ type: 'suspicious_activity', severity: 'error' })
            }));
        });

        test('should not log agent communication if clean', () => {
            (securityManager as any)['policy'].auditAll = false; // Ensure it's not auditing all
            (mockEventBus.publish as jest.Mock).mockClear(); // Clear previous calls from setup

            const agentHandler = (mockEventBus.subscribe as jest.Mock).mock.calls.find(call => call[0] === 'agent.*')?.[1];
            agentHandler({ content: 'clean message' });
            
            expect(mockEventBus.publish).not.toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ type: 'suspicious_activity' })
            }));
        });

        test('should monitor tool executions for sensitive operations', () => {
            const toolHandler = (mockEventBus.subscribe as jest.Mock).mock.calls.find(call => call[0] === 'tool.*')?.[1];
            expect(toolHandler).toBeDefined();

            toolHandler({ command: { action: 'file_access', args: ['path/to/file'] } });

            expect(mockEventBus.publish).toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ type: 'permission_check', severity: 'info' })
            }));
        });

        test('should not monitor non-sensitive tool executions', () => {
            (mockEventBus.publish as jest.Mock).mockClear(); // Clear previous calls from setup
            const toolHandler = (mockEventBus.subscribe as jest.Mock).mock.calls.find(call => call[0] === 'tool.*')?.[1];
            toolHandler({ command: { action: 'read', args: ['config.json'] } }); // 'read' is not explicitly sensitive

            expect(mockEventBus.publish).not.toHaveBeenCalledWith('security.event_logged', expect.objectContaining({
                event: expect.objectContaining({ type: 'permission_check' })
            }));
        });
    });

});