import fs from 'fs';
import path from 'path';

import { createCanvas } from 'canvas';
import { Chart, registerables } from 'chart.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

import { Logger } from '../../core/logging/logger';

import { DashboardMetrics } from './AdvancedAnalyticsService';

Chart.register(...registerables);

const logger = new Logger('DataVisualizationService');

export interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'doughnut' | 'radar' | 'scatter' | 'bubble';
  title: string;
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string | string[];
      borderWidth?: number;
      fill?: boolean;
    }>;
  };
  options?: {
    responsive?: boolean;
    plugins?: any;
    scales?: any;
    elements?: any;
  };
  width?: number;
  height?: number;
}

export interface ReportTemplate {
  title: string;
  subtitle?: string;
  sections: Array<{
    title: string;
    type: 'text' | 'chart' | 'table' | 'metrics';
    content: any;
  }>;
  footer?: string;
  branding?: {
    logo?: string;
    colors?: {
      primary: string;
      secondary: string;
    };
  };
}

export class DataVisualizationService {

  async generateChart(config: ChartConfig): Promise<Buffer> {
    try {
      const canvas = createCanvas(config.width || 800, config.height || 600);
      const ctx = canvas.getContext('2d');

      const chartConfig = {
        type: config.type,
        data: config.data,
        options: {
          ...config.options,
          responsive: false,
          animation: false,
          plugins: {
            title: {
              display: true,
              text: config.title,
              font: {
                size: 16,
                weight: 'bold'
              }
            },
            legend: {
              display: true,
              position: 'top'
            },
            ...config.options?.plugins
          }
        }
      };

      new Chart(ctx as any, chartConfig as any);

      return canvas.toBuffer('image/png');

    } catch (error) {
      logger.error('Failed to generate chart', error);
      throw error;
    }
  }

  async generateDashboardCharts(metrics: DashboardMetrics): Promise<{
    salesChart: Buffer;
    categoriesChart: Buffer;
    performanceChart: Buffer;
    rfqChart: Buffer;
  }> {
    try {
      // Sales trend chart
      const salesChart = await this.generateChart({
        type: 'line',
        title: 'Sales Trend',
        data: {
          labels: metrics.sales.dailySales.map(item => item.date),
          datasets: [{
            label: 'Revenue',
            data: metrics.sales.dailySales.map(item => item.revenue),
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true
          }, {
            label: 'Orders',
            data: metrics.sales.dailySales.map(item => item.orders),
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            fill: true
          }]
        },
        options: {
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });

      // Top categories chart
      const categoriesChart = await this.generateChart({
        type: 'doughnut',
        title: 'Top Categories by Revenue',
        data: {
          labels: metrics.sales.topCategories.map(cat => cat.name),
          datasets: [{
            data: metrics.sales.topCategories.map(cat => cat.revenue),
            backgroundColor: [
              '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
              '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
            ]
          }]
        }
      });

      // Performance metrics chart
      const performanceChart = await this.generateChart({
        type: 'radar',
        title: 'Performance Metrics',
        data: {
          labels: ['Quality Score', 'On-Time Delivery', 'Customer Satisfaction', 'Order Accuracy', 'Response Time'],
          datasets: [{
            label: 'Current Performance',
            data: [
              metrics.performance.orderFulfillment.qualityScore * 20, // Scale to 100
              metrics.performance.orderFulfillment.onTimeDeliveryRate,
              85, // Mock customer satisfaction
              92, // Mock order accuracy
              78  // Mock response time score
            ],
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            borderColor: '#3B82F6',
            pointBackgroundColor: '#3B82F6'
          }]
        },
        options: {
          scales: {
            r: {
              beginAtZero: true,
              max: 100
            }
          }
        }
      });

      // RFQ analytics chart
      const rfqChart = await this.generateChart({
        type: 'bar',
        title: 'RFQ Analytics',
        data: {
          labels: metrics.rfqAnalytics.topRequestedCategories.map(cat => cat.name),
          datasets: [{
            label: 'RFQ Count',
            data: metrics.rfqAnalytics.topRequestedCategories.map(cat => cat.count),
            backgroundColor: '#10B981',
            borderColor: '#059669',
            borderWidth: 1
          }]
        },
        options: {
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });

      return {
        salesChart,
        categoriesChart,
        performanceChart,
        rfqChart
      };

    } catch (error) {
      logger.error('Failed to generate dashboard charts', error);
      throw error;
    }
  }

  async generatePDFReport(template: ReportTemplate, charts?: Record<string, Buffer>): Promise<Buffer> {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));

      // Header
      doc.fontSize(24).text(template.title, { align: 'center' });

      if (template.subtitle) {
        doc.fontSize(14).text(template.subtitle, { align: 'center' });
      }

      doc.moveDown(2);

      // Sections
      for (const section of template.sections) {
        // Section title
        doc.fontSize(18).text(section.title, { underline: true });
        doc.moveDown();

        switch (section.type) {
          case 'text':
            doc.fontSize(12).text(section.content);
            break;

          case 'chart':
            if (charts && charts[section.content.chartId]) {
              const chartBuffer = charts[section.content.chartId];
              doc.image(chartBuffer, {
                fit: [500, 300],
                align: 'center'
              });
            }
            break;

          case 'table':
            await this.addTableToPDF(doc, section.content);
            break;

          case 'metrics':
            await this.addMetricsToPDF(doc, section.content);
            break;
        }

        doc.moveDown(2);
      }

      // Footer
      if (template.footer) {
        doc.fontSize(10).text(template.footer, 50, doc.page.height - 50, {
          align: 'center'
        });
      }

      doc.end();

      return new Promise((resolve, reject) => {
        doc.on('end', () => {
          resolve(Buffer.concat(buffers));
        });

        doc.on('error', reject);
      });

    } catch (error) {
      logger.error('Failed to generate PDF report', error);
      throw error;
    }
  }

  private async addTableToPDF(doc: PDFKit.PDFDocument, tableData: {
    headers: string[];
    rows: any[][];
  }) {
    const { headers, rows } = tableData;
    const startX = 50;
    let currentY = doc.y;
    const columnWidth = (doc.page.width - 100) / headers.length;

    // Headers
    doc.fontSize(10).fillColor('#333');
    headers.forEach((header, index) => {
      doc.text(header, startX + (index * columnWidth), currentY, {
        width: columnWidth,
        align: 'center'
      });
    });

    currentY += 20;
    doc.strokeColor('#ccc').lineWidth(1);
    doc.moveTo(startX, currentY).lineTo(doc.page.width - 50, currentY).stroke();
    currentY += 10;

    // Rows
    rows.forEach((row, rowIndex) => {
      row.forEach((cell, cellIndex) => {
        doc.text(String(cell), startX + (cellIndex * columnWidth), currentY, {
          width: columnWidth,
          align: 'center'
        });
      });
      currentY += 15;
    });

    doc.y = currentY + 10;
  }

  private async addMetricsToPDF(doc: PDFKit.PDFDocument, metrics: Array<{
    label: string;
    value: string | number;
    change?: number;
  }>) {
    const startX = 50;
    let currentY = doc.y;

    metrics.forEach((metric, index) => {
      const x = startX + (index % 2) * 250;
      if (index % 2 === 0 && index > 0) {
        currentY += 40;
      }

      // Metric box
      doc.rect(x, currentY, 200, 30).stroke();

      // Label
      doc.fontSize(10).fillColor('#666').text(metric.label, x + 10, currentY + 5);

      // Value
      doc.fontSize(14).fillColor('#333').text(String(metric.value), x + 10, currentY + 15);

      // Change indicator
      if (metric.change !== undefined) {
        const changeColor = metric.change >= 0 ? '#10B981' : '#EF4444';
        const changeText = `${metric.change >= 0 ? '+' : ''}${metric.change.toFixed(1)}%`;
        doc.fontSize(10).fillColor(changeColor).text(changeText, x + 150, currentY + 15);
      }
    });

    doc.y = currentY + 50;
  }

  async generateExcelReport(data: {
    sheets: Array<{
      name: string;
      data: any[][];
      headers?: string[];
    }>;
  }): Promise<Buffer> {
    try {
      const workbook = new ExcelJS.Workbook();

      data.sheets.forEach(sheetData => {
        const worksheet = workbook.addWorksheet(sheetData.name);

        // Add headers if provided
        if (sheetData.headers) {
          worksheet.addRow(sheetData.headers);

          // Style headers
          const headerRow = worksheet.getRow(1);
          headerRow.font = { bold: true };
          headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF3B82F6' }
          };
        }

        // Add data rows
        sheetData.data.forEach(row => {
          worksheet.addRow(row);
        });

        // Auto-fit columns
        worksheet.columns.forEach(column => {
          if (column.header) {
            column.width = Math.max(column.header.length + 2, 10);
          }
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);

    } catch (error) {
      logger.error('Failed to generate Excel report', error);
      throw error;
    }
  }

  async generateCSVReport(data: {
    headers: string[];
    rows: any[][];
  }): Promise<Buffer> {
    try {
      let csv = `${data.headers.join(',')  }\n`;

      data.rows.forEach(row => {
        const escapedRow = row.map(cell => {
          const cellStr = String(cell);
          // Escape quotes and wrap in quotes if contains comma or quote
          if (cellStr.includes(',') || cellStr.includes('"')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        });
        csv += `${escapedRow.join(',')  }\n`;
      });

      return Buffer.from(csv, 'utf-8');

    } catch (error) {
      logger.error('Failed to generate CSV report', error);
      throw error;
    }
  }

  async generateDashboardReport(
    metrics: DashboardMetrics,
    format: 'PDF' | 'EXCEL' | 'CSV',
    companyName: string
  ): Promise<Buffer> {
    try {
      switch (format) {
        case 'PDF':
          const charts = await this.generateDashboardCharts(metrics);

          const pdfTemplate: ReportTemplate = {
            title: `${companyName} - Analytics Dashboard`,
            subtitle: `Generated on ${new Date().toLocaleDateString()}`,
            sections: [
              {
                title: 'Overview Metrics',
                type: 'metrics',
                content: [
                  { label: 'Total Revenue', value: `$${metrics.overview.totalRevenue.toLocaleString()}`, change: metrics.overview.growthRate },
                  { label: 'Total Orders', value: metrics.overview.totalOrders.toLocaleString() },
                  { label: 'Total Products', value: metrics.overview.totalProducts.toLocaleString() },
                  { label: 'Conversion Rate', value: `${metrics.overview.conversionRate.toFixed(1)}%` }
                ]
              },
              {
                title: 'Sales Trend',
                type: 'chart',
                content: { chartId: 'salesChart' }
              },
              {
                title: 'Top Categories',
                type: 'chart',
                content: { chartId: 'categoriesChart' }
              },
              {
                title: 'Performance Metrics',
                type: 'chart',
                content: { chartId: 'performanceChart' }
              },
              {
                title: 'RFQ Analytics',
                type: 'chart',
                content: { chartId: 'rfqChart' }
              }
            ],
            footer: `Report generated by Foodxchange Analytics • ${new Date().toISOString()}`
          };

          return await this.generatePDFReport(pdfTemplate, {
            salesChart: charts.salesChart,
            categoriesChart: charts.categoriesChart,
            performanceChart: charts.performanceChart,
            rfqChart: charts.rfqChart
          });

        case 'EXCEL':
          return await this.generateExcelReport({
            sheets: [
              {
                name: 'Overview',
                headers: ['Metric', 'Value', 'Growth %'],
                data: [
                  ['Total Revenue', metrics.overview.totalRevenue, metrics.overview.growthRate],
                  ['Total Orders', metrics.overview.totalOrders, ''],
                  ['Total Products', metrics.overview.totalProducts, ''],
                  ['Conversion Rate', `${metrics.overview.conversionRate.toFixed(1)}%`, '']
                ]
              },
              {
                name: 'Daily Sales',
                headers: ['Date', 'Revenue', 'Orders'],
                data: metrics.sales.dailySales.map(item => [item.date, item.revenue, item.orders])
              },
              {
                name: 'Top Products',
                headers: ['Product', 'Revenue', 'Units Sold'],
                data: metrics.sales.topProducts.map(item => [item.name, item.revenue, item.units])
              },
              {
                name: 'Top Categories',
                headers: ['Category', 'Revenue', 'Percentage'],
                data: metrics.sales.topCategories.map(item => [item.name, item.revenue, item.percentage])
              }
            ]
          });

        case 'CSV':
          return await this.generateCSVReport({
            headers: ['Metric', 'Value'],
            rows: [
              ['Total Revenue', metrics.overview.totalRevenue],
              ['Total Orders', metrics.overview.totalOrders],
              ['Total Products', metrics.overview.totalProducts],
              ['Growth Rate %', metrics.overview.growthRate],
              ['Conversion Rate %', metrics.overview.conversionRate]
            ]
          });

        default:
          throw new Error(`Unsupported format: ${format}`);
      }

    } catch (error) {
      logger.error('Failed to generate dashboard report', error);
      throw error;
    }
  }
}

export const dataVisualizationService = new DataVisualizationService();
