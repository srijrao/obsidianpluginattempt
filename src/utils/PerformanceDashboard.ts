/**
 * @file PerformanceDashboard.ts
 * 
 * Real-time Performance Monitoring Dashboard for AI Assistant
 * 
 * Features:
 * - Real-time metrics visualization
 * - Automated alerting for performance degradation
 * - Historical performance tracking
 * - Interactive dashboard with charts
 * - Export capabilities
 */

import { Plugin, Modal, TFile } from 'obsidian';
import { performanceMonitor } from './performanceMonitor';
import { apiCircuitBreaker } from './APICircuitBreaker';
import { debugLog } from './logger';

export interface DashboardConfig {
  refreshInterval: number;
  alertThresholds: {
    responseTime: number;
    errorRate: number;
    memoryUsage: number;
    cacheHitRate: number;
  };
  enableAlerts: boolean;
  historicalDataPoints: number;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'eq';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  cooldownMs: number;
  lastTriggered: number;
}

export interface PerformanceAlert {
  id: string;
  rule: AlertRule;
  value: number;
  timestamp: number;
  message: string;
  acknowledged: boolean;
}

export class PerformanceDashboard {
  private static instance: PerformanceDashboard;
  private config: DashboardConfig;
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, PerformanceAlert> = new Map();
  private historicalData: Array<{ timestamp: number; metrics: any }> = [];
  private refreshTimer?: NodeJS.Timeout;
  private isRunning = false;

  private readonly DEFAULT_CONFIG: DashboardConfig = {
    refreshInterval: 10000, // 10 seconds
    alertThresholds: {
      responseTime: 5000, // 5 seconds
      errorRate: 10, // 10%
      memoryUsage: 100 * 1024 * 1024, // 100MB
      cacheHitRate: 50 // 50%
    },
    enableAlerts: true,
    historicalDataPoints: 288 // 24 hours at 5-minute intervals
  };

  static getInstance(): PerformanceDashboard {
    if (!PerformanceDashboard.instance) {
      PerformanceDashboard.instance = new PerformanceDashboard();
    }
    return PerformanceDashboard.instance;
  }

  constructor() {
    this.config = { ...this.DEFAULT_CONFIG };
    this.initializeDefaultAlertRules();
  }

  /**
   * Start the dashboard monitoring
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.refreshTimer = setInterval(() => {
      this.collectMetrics();
      this.checkAlerts();
    }, this.config.refreshInterval);
    
    debugLog(true, 'info', '[PerformanceDashboard] Started monitoring');
  }

  /**
   * Stop the dashboard monitoring
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    
    debugLog(true, 'info', '[PerformanceDashboard] Stopped monitoring');
  }

  /**
   * Get current performance snapshot
   */
  getCurrentSnapshot(): any {
    const metrics = performanceMonitor.getMetrics();
    const circuitBreakerMetrics = apiCircuitBreaker.getAllMetrics();
    
    return {
      timestamp: Date.now(),
      performance: metrics,
      circuitBreakers: circuitBreakerMetrics,
      alerts: {
        total: this.activeAlerts.size,
        critical: Array.from(this.activeAlerts.values()).filter(a => a.rule.severity === 'critical').length,
        unacknowledged: Array.from(this.activeAlerts.values()).filter(a => !a.acknowledged).length
      },
      system: {
        uptime: Date.now() - (this.historicalData[0]?.timestamp || Date.now()),
        dataPoints: this.historicalData.length
      }
    };
  }

  /**
   * Get historical performance data
   */
  getHistoricalData(hours: number = 24): Array<{ timestamp: number; metrics: any }> {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return this.historicalData.filter(data => data.timestamp > cutoff);
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: Omit<AlertRule, 'id' | 'lastTriggered'>): string {
    const id = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const alertRule: AlertRule = {
      ...rule,
      id,
      lastTriggered: 0
    };
    
    this.alertRules.set(id, alertRule);
    debugLog(true, 'info', `[PerformanceDashboard] Added alert rule: ${rule.name}`);
    
    return id;
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(id: string): boolean {
    return this.alertRules.delete(id);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(id: string): boolean {
    const alert = this.activeAlerts.get(id);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Clear all acknowledged alerts
   */
  clearAcknowledgedAlerts(): number {
    let cleared = 0;
    for (const [id, alert] of this.activeAlerts.entries()) {
      if (alert.acknowledged) {
        this.activeAlerts.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Generate performance report
   */
  generateReport(hours: number = 24): string {
    const snapshot = this.getCurrentSnapshot();
    const historical = this.getHistoricalData(hours);
    
    // Calculate trends
    const oldData = historical[0];
    const trends = oldData ? {
      responseTime: this.calculateTrend(historical, 'performance.averageResponseTime'),
      errorRate: this.calculateTrend(historical, 'performance.errorRate'),
      cacheHitRate: this.calculateTrend(historical, 'performance.cacheHitRate'),
      memoryUsage: this.calculateTrend(historical, 'performance.memoryUsage')
    } : null;

    return `
# AI Assistant Performance Report
Generated: ${new Date().toISOString()}
Period: ${hours} hours

## Current Status
- **Response Time**: ${snapshot.performance.averageResponseTime.toFixed(2)}ms
- **Error Rate**: ${snapshot.performance.errorRate.toFixed(2)}%
- **Cache Hit Rate**: ${snapshot.performance.cacheHitRate.toFixed(2)}%
- **Memory Usage**: ${(snapshot.performance.memoryUsage / 1024 / 1024).toFixed(2)}MB
- **API Calls/min**: ${snapshot.performance.apiCallsPerMinute}

## Circuit Breakers
${Object.entries(snapshot.circuitBreakers).map(([provider, metrics]: [string, any]) => 
  `- **${provider}**: ${metrics.state} (${metrics.totalCalls} calls, ${metrics.failureRate.toFixed(2)}% failure rate)`
).join('\n')}

## Alerts
- **Total Active**: ${snapshot.alerts.total}
- **Critical**: ${snapshot.alerts.critical}
- **Unacknowledged**: ${snapshot.alerts.unacknowledged}

${trends ? `## Trends (${hours}h)
- **Response Time**: ${trends.responseTime > 0 ? '📈' : '📉'} ${trends.responseTime.toFixed(2)}%
- **Error Rate**: ${trends.errorRate > 0 ? '📈' : '📉'} ${trends.errorRate.toFixed(2)}%
- **Cache Hit Rate**: ${trends.cacheHitRate > 0 ? '📈' : '📉'} ${trends.cacheHitRate.toFixed(2)}%
- **Memory Usage**: ${trends.memoryUsage > 0 ? '📈' : '📉'} ${trends.memoryUsage.toFixed(2)}%` : ''}

## Recent Alerts
${Array.from(this.activeAlerts.values())
  .sort((a, b) => b.timestamp - a.timestamp)
  .slice(0, 10)
  .map(alert => `- [${alert.rule.severity.toUpperCase()}] ${alert.message} (${new Date(alert.timestamp).toLocaleString()})`)
  .join('\n') || 'No recent alerts'}

---
*Report generated by AI Assistant Performance Dashboard*
    `.trim();
  }

  /**
   * Export dashboard data
   */
  exportData(): any {
    return {
      config: this.config,
      alertRules: Array.from(this.alertRules.values()),
      activeAlerts: Array.from(this.activeAlerts.values()),
      historicalData: this.historicalData,
      snapshot: this.getCurrentSnapshot()
    };
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultAlertRules(): void {
    const defaultRules: Array<Omit<AlertRule, 'id' | 'lastTriggered'>> = [
      {
        name: 'High Response Time',
        metric: 'averageResponseTime',
        threshold: this.config.alertThresholds.responseTime,
        operator: 'gt',
        severity: 'high',
        enabled: true,
        cooldownMs: 300000 // 5 minutes
      },
      {
        name: 'High Error Rate',
        metric: 'errorRate',
        threshold: this.config.alertThresholds.errorRate,
        operator: 'gt',
        severity: 'critical',
        enabled: true,
        cooldownMs: 180000 // 3 minutes
      },
      {
        name: 'Low Cache Hit Rate',
        metric: 'cacheHitRate',
        threshold: this.config.alertThresholds.cacheHitRate,
        operator: 'lt',
        severity: 'medium',
        enabled: true,
        cooldownMs: 600000 // 10 minutes
      },
      {
        name: 'High Memory Usage',
        metric: 'memoryUsage',
        threshold: this.config.alertThresholds.memoryUsage,
        operator: 'gt',
        severity: 'high',
        enabled: true,
        cooldownMs: 300000 // 5 minutes
      }
    ];

    defaultRules.forEach(rule => this.addAlertRule(rule));
  }

  /**
   * Collect current metrics and store historically
   */
  private collectMetrics(): void {
    const snapshot = this.getCurrentSnapshot();
    
    this.historicalData.push({
      timestamp: snapshot.timestamp,
      metrics: snapshot
    });

    // Cleanup old data
    if (this.historicalData.length > this.config.historicalDataPoints) {
      this.historicalData = this.historicalData.slice(-this.config.historicalDataPoints);
    }
  }

  /**
   * Check alert rules and trigger alerts
   */
  private checkAlerts(): void {
    if (!this.config.enableAlerts) return;

    const metrics = performanceMonitor.getMetrics();
    const now = Date.now();

    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;
      
      // Check cooldown
      if (now - rule.lastTriggered < rule.cooldownMs) continue;

      const value = this.getMetricValue(metrics, rule.metric);
      if (value === undefined) continue;

      let triggered = false;
      switch (rule.operator) {
        case 'gt':
          triggered = value > rule.threshold;
          break;
        case 'lt':
          triggered = value < rule.threshold;
          break;
        case 'eq':
          triggered = value === rule.threshold;
          break;
      }

      if (triggered) {
        this.triggerAlert(rule, value);
      }
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(rule: AlertRule, value: number): void {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const alert: PerformanceAlert = {
      id: alertId,
      rule,
      value,
      timestamp: Date.now(),
      message: `${rule.name}: ${rule.metric} is ${value} (threshold: ${rule.threshold})`,
      acknowledged: false
    };

    this.activeAlerts.set(alertId, alert);
    rule.lastTriggered = Date.now();

    debugLog(true, 'warn', `[PerformanceDashboard] Alert triggered: ${alert.message}`);

    // Auto-cleanup old alerts (keep last 100)
    if (this.activeAlerts.size > 100) {
      const sorted = Array.from(this.activeAlerts.entries())
        .sort(([,a], [,b]) => b.timestamp - a.timestamp);
      
      // Keep only the 100 most recent
      this.activeAlerts.clear();
      sorted.slice(0, 100).forEach(([id, alert]) => {
        this.activeAlerts.set(id, alert);
      });
    }
  }

  /**
   * Get metric value by path
   */
  private getMetricValue(metrics: any, path: string): number | undefined {
    return path.split('.').reduce((obj, key) => obj?.[key], metrics);
  }

  /**
   * Calculate trend percentage
   */
  private calculateTrend(data: Array<{ timestamp: number; metrics: any }>, metricPath: string): number {
    if (data.length < 2) return 0;

    const oldValue = this.getMetricValue(data[0].metrics, metricPath);
    const newValue = this.getMetricValue(data[data.length - 1].metrics, metricPath);

    if (oldValue === undefined || newValue === undefined || oldValue === 0) return 0;

    return ((newValue - oldValue) / oldValue) * 100;
  }
}

/**
 * Dashboard Modal for Obsidian UI
 */
export class PerformanceDashboardModal extends Modal {
  private dashboard: PerformanceDashboard;
  private refreshTimer?: NodeJS.Timeout;

  constructor(plugin: Plugin) {
    super(plugin.app);
    this.dashboard = PerformanceDashboard.getInstance();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    contentEl.createEl('h2', { text: 'AI Assistant Performance Dashboard' });
    
    this.renderDashboard();
    
    // Auto-refresh every 10 seconds
    this.refreshTimer = setInterval(() => {
      this.renderDashboard();
    }, 10000);
  }

  onClose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  private renderDashboard(): void {
    const snapshot = this.dashboard.getCurrentSnapshot();
    const { contentEl } = this;
    
    // Clear previous content (except title)
    const children = Array.from(contentEl.children);
    children.slice(1).forEach(child => child.remove());

    // Current Metrics Section
    const metricsSection = contentEl.createDiv('dashboard-metrics');
    metricsSection.createEl('h3', { text: 'Current Performance' });
    
    const metricsGrid = metricsSection.createDiv('metrics-grid');
    metricsGrid.style.display = 'grid';
    metricsGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
    metricsGrid.style.gap = '16px';
    
    this.createMetricCard(metricsGrid, 'Response Time', `${snapshot.performance.averageResponseTime.toFixed(2)}ms`, 
      snapshot.performance.averageResponseTime > 2000 ? 'warning' : 'good');
    this.createMetricCard(metricsGrid, 'Error Rate', `${snapshot.performance.errorRate.toFixed(2)}%`,
      snapshot.performance.errorRate > 5 ? 'danger' : 'good');
    this.createMetricCard(metricsGrid, 'Cache Hit Rate', `${snapshot.performance.cacheHitRate.toFixed(2)}%`,
      snapshot.performance.cacheHitRate < 70 ? 'warning' : 'good');
    this.createMetricCard(metricsGrid, 'Memory Usage', `${(snapshot.performance.memoryUsage / 1024 / 1024).toFixed(2)}MB`,
      snapshot.performance.memoryUsage > 50 * 1024 * 1024 ? 'warning' : 'good');

    // Circuit Breakers Section
    const circuitSection = contentEl.createDiv('dashboard-circuits');
    circuitSection.createEl('h3', { text: 'Circuit Breakers' });
    
    const circuitGrid = circuitSection.createDiv('circuit-grid');
    circuitGrid.style.display = 'grid';
    circuitGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(150px, 1fr))';
    circuitGrid.style.gap = '12px';
    
    Object.entries(snapshot.circuitBreakers).forEach(([provider, metrics]) => {
      const cbMetrics = metrics as any; // Type assertion for circuit breaker metrics
      this.createCircuitCard(circuitGrid, provider, cbMetrics.state, cbMetrics.failureRate);
    });

    // Alerts Section
    const alertsSection = contentEl.createDiv('dashboard-alerts');
    alertsSection.createEl('h3', { text: 'Active Alerts' });
    
    if (snapshot.alerts.total === 0) {
      alertsSection.createEl('p', { text: 'No active alerts', cls: 'alert-none' });
    } else {
      const alertsList = alertsSection.createDiv('alerts-list');
      Array.from(this.dashboard['activeAlerts'].values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5)
        .forEach(alert => {
          this.createAlertItem(alertsList, alert);
        });
    }

    // Action Buttons
    const actionsSection = contentEl.createDiv('dashboard-actions');
    actionsSection.style.marginTop = '20px';
    actionsSection.style.display = 'flex';
    actionsSection.style.gap = '10px';
    
    const exportBtn = actionsSection.createEl('button', { text: 'Export Report' });
    exportBtn.onclick = () => this.exportReport();
    
    const clearAlertsBtn = actionsSection.createEl('button', { text: 'Clear Alerts' });
    clearAlertsBtn.onclick = () => {
      const cleared = this.dashboard.clearAcknowledgedAlerts();
      console.log(`Cleared ${cleared} acknowledged alerts`);
      this.renderDashboard();
    };
  }

  private createMetricCard(parent: HTMLElement, title: string, value: string, status: 'good' | 'warning' | 'danger'): void {
    const card = parent.createDiv(`metric-card metric-${status}`);
    card.style.padding = '16px';
    card.style.border = '1px solid var(--background-modifier-border)';
    card.style.borderRadius = '8px';
    card.style.backgroundColor = status === 'danger' ? 'rgba(255,0,0,0.1)' : 
                                 status === 'warning' ? 'rgba(255,165,0,0.1)' : 
                                 'rgba(0,255,0,0.1)';
    
    card.createEl('h4', { text: title, cls: 'metric-title' });
    card.createEl('div', { text: value, cls: 'metric-value' });
  }

  private createCircuitCard(parent: HTMLElement, provider: string, state: string, failureRate: number): void {
    const card = parent.createDiv(`circuit-card circuit-${state.toLowerCase()}`);
    card.style.padding = '12px';
    card.style.border = '1px solid var(--background-modifier-border)';
    card.style.borderRadius = '6px';
    card.style.backgroundColor = state === 'OPEN' ? 'rgba(255,0,0,0.1)' : 
                                state === 'HALF_OPEN' ? 'rgba(255,165,0,0.1)' : 
                                'rgba(0,255,0,0.1)';
    
    card.createEl('div', { text: provider.toUpperCase(), cls: 'circuit-provider' });
    card.createEl('div', { text: state, cls: 'circuit-state' });
    card.createEl('div', { text: `${failureRate.toFixed(1)}% fail`, cls: 'circuit-rate' });
  }

  private createAlertItem(parent: HTMLElement, alert: PerformanceAlert): void {
    const item = parent.createDiv(`alert-item alert-${alert.rule.severity}`);
    item.style.padding = '8px';
    item.style.marginBottom = '8px';
    item.style.border = '1px solid var(--background-modifier-border)';
    item.style.borderRadius = '4px';
    item.style.backgroundColor = alert.rule.severity === 'critical' ? 'rgba(255,0,0,0.1)' : 
                                alert.rule.severity === 'high' ? 'rgba(255,165,0,0.1)' : 
                                'rgba(255,255,0,0.1)';
    
    item.createEl('div', { text: alert.message, cls: 'alert-message' });
    item.createEl('div', { text: new Date(alert.timestamp).toLocaleString(), cls: 'alert-time' });
    
    if (!alert.acknowledged) {
      const ackBtn = item.createEl('button', { text: 'Acknowledge' });
      ackBtn.onclick = () => {
        this.dashboard.acknowledgeAlert(alert.id);
        this.renderDashboard();
      };
    }
  }

  private async exportReport(): Promise<void> {
    const report = this.dashboard.generateReport(24);
    const fileName = `performance-report-${new Date().toISOString().split('T')[0]}.md`;
    
    try {
      await this.app.vault.create(fileName, report);
      console.log(`Performance report exported to ${fileName}`);
    } catch (error) {
      console.error('Failed to export report:', error);
    }
  }
}

// Singleton instance
export const performanceDashboard = PerformanceDashboard.getInstance();
