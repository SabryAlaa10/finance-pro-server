import express from 'express';
import PDFDocument from 'pdfkit';
import pool from '../config/db.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();
router.use(verifyToken);

// Professional color palette
const COLORS = {
    primary: '#6366f1',
    income: '#10b981',
    expense: '#f43f5e',
    investment: '#8b5cf6',
    text: '#1f2937',
    muted: '#6b7280',
    light: '#f3f4f6',
    dark: '#111827'
};

// Helper to draw a rounded rectangle
const drawRoundedRect = (doc, x, y, w, h, r, fill) => {
    doc.roundedRect(x, y, w, h, r).fill(fill);
};

// Draw a simple bar
const drawBar = (doc, x, y, width, height, color) => {
    doc.roundedRect(x, y, width, height, 3).fill(color);
};

// Helper to generate professional PDF
const generatePDF = async (userId, periodType) => {
    const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        info: {
            Title: `Finance PRO ${periodType === 'weekly' ? 'Weekly' : 'Monthly'} Report`,
            Author: 'Finance PRO Dashboard'
        }
    });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));

    // Calculate date range
    const now = new Date();
    let startDate;

    if (periodType === 'weekly') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Fetch transactions
    const result = await pool.query(
        `SELECT date, type, category, source, amount, description
         FROM transactions
         WHERE user_id = $1 AND date >= $2 AND date <= $3
         ORDER BY date DESC`,
        [userId, startDate.toISOString().split('T')[0], now.toISOString().split('T')[0]]
    );

    // Fetch summary
    const summaryResult = await pool.query(
        `SELECT 
          COALESCE(SUM(CASE WHEN type = 'Income' THEN amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END), 0) as expenses,
          COALESCE(SUM(CASE WHEN type = 'Investment' THEN amount ELSE 0 END), 0) as investments
         FROM transactions
         WHERE user_id = $1 AND date >= $2 AND date <= $3`,
        [userId, startDate.toISOString().split('T')[0], now.toISOString().split('T')[0]]
    );

    // Fetch category breakdown
    const categoryResult = await pool.query(
        `SELECT category, type, SUM(amount) as total
         FROM transactions
         WHERE user_id = $1 AND date >= $2 AND date <= $3
         GROUP BY category, type
         ORDER BY total DESC`,
        [userId, startDate.toISOString().split('T')[0], now.toISOString().split('T')[0]]
    );

    const summary = summaryResult.rows[0];
    const transactions = result.rows;
    const categories = categoryResult.rows;

    const income = parseFloat(summary.income);
    const expenses = parseFloat(summary.expenses);
    const investments = parseFloat(summary.investments);
    const netBalance = income - expenses;

    // ========== HEADER ==========
    // Header background
    drawRoundedRect(doc, 40, 40, 515, 100, 12, COLORS.primary);

    // Logo & Title
    doc.fontSize(28).fillColor('white').text('💎 Finance PRO', 60, 60, { continued: false });
    doc.fontSize(14).fillColor('rgba(255,255,255,0.9)').text(
        `${periodType === 'weekly' ? 'Weekly' : 'Monthly'} Financial Report`,
        60, 95
    );

    // Date range badge
    doc.fontSize(10).fillColor('rgba(255,255,255,0.7)').text(
        `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        430, 75, { align: 'right', width: 100 }
    );

    // ========== SUMMARY CARDS ==========
    const cardY = 165;
    const cardWidth = 163;
    const cardGap = 13;

    // Income Card
    drawRoundedRect(doc, 40, cardY, cardWidth, 85, 10, '#ecfdf5');
    doc.fontSize(10).fillColor(COLORS.muted).text('TOTAL INCOME', 55, cardY + 15);
    doc.fontSize(22).fillColor(COLORS.income).text(`${income.toLocaleString()}`, 55, cardY + 35);
    doc.fontSize(10).fillColor(COLORS.muted).text('EGP', 55, cardY + 62);

    // Expenses Card
    drawRoundedRect(doc, 40 + cardWidth + cardGap, cardY, cardWidth, 85, 10, '#fef2f2');
    doc.fontSize(10).fillColor(COLORS.muted).text('TOTAL EXPENSES', 55 + cardWidth + cardGap, cardY + 15);
    doc.fontSize(22).fillColor(COLORS.expense).text(`${expenses.toLocaleString()}`, 55 + cardWidth + cardGap, cardY + 35);
    doc.fontSize(10).fillColor(COLORS.muted).text('EGP', 55 + cardWidth + cardGap, cardY + 62);

    // Net Balance Card
    const netColor = netBalance >= 0 ? COLORS.income : COLORS.expense;
    const netBg = netBalance >= 0 ? '#ecfdf5' : '#fef2f2';
    drawRoundedRect(doc, 40 + (cardWidth + cardGap) * 2, cardY, cardWidth, 85, 10, netBg);
    doc.fontSize(10).fillColor(COLORS.muted).text('NET BALANCE', 55 + (cardWidth + cardGap) * 2, cardY + 15);
    doc.fontSize(22).fillColor(netColor).text(`${netBalance >= 0 ? '+' : ''}${netBalance.toLocaleString()}`, 55 + (cardWidth + cardGap) * 2, cardY + 35);
    doc.fontSize(10).fillColor(COLORS.muted).text('EGP', 55 + (cardWidth + cardGap) * 2, cardY + 62);

    // ========== CATEGORY BREAKDOWN CHART ==========
    let chartY = 280;
    doc.fontSize(14).fillColor(COLORS.text).text('📊 Spending by Category', 40, chartY);
    chartY += 30;

    const expenseCategories = categories.filter(c => c.type === 'Expense').slice(0, 6);
    const maxAmount = expenseCategories.length > 0 ? Math.max(...expenseCategories.map(c => parseFloat(c.total))) : 1;
    const barColors = ['#f43f5e', '#fb7185', '#e11d48', '#be123c', '#9f1239', '#881337'];

    expenseCategories.forEach((cat, i) => {
        const amount = parseFloat(cat.total);
        const barWidth = Math.max((amount / maxAmount) * 350, 10);

        // Category name
        doc.fontSize(10).fillColor(COLORS.text).text(cat.category, 40, chartY + 3, { width: 100 });

        // Bar
        drawBar(doc, 145, chartY, barWidth, 18, barColors[i % barColors.length]);

        // Amount
        doc.fontSize(9).fillColor(COLORS.muted).text(`${amount.toLocaleString()} EGP`, 505, chartY + 3, { align: 'right', width: 50 });

        chartY += 28;
    });

    if (expenseCategories.length === 0) {
        doc.fontSize(11).fillColor(COLORS.muted).text('No expense data for this period', 40, chartY);
        chartY += 25;
    }

    // ========== INCOME SOURCES ==========
    chartY += 20;
    doc.fontSize(14).fillColor(COLORS.text).text('💰 Income Sources', 40, chartY);
    chartY += 30;

    const incomeCategories = categories.filter(c => c.type === 'Income').slice(0, 4);
    const incomeColors = ['#10b981', '#34d399', '#059669', '#047857'];

    incomeCategories.forEach((cat, i) => {
        const amount = parseFloat(cat.total);
        const barWidth = Math.max((amount / Math.max(...incomeCategories.map(c => parseFloat(c.total)))) * 350, 10);

        doc.fontSize(10).fillColor(COLORS.text).text(cat.category, 40, chartY + 3, { width: 100 });
        drawBar(doc, 145, chartY, barWidth, 18, incomeColors[i % incomeColors.length]);
        doc.fontSize(9).fillColor(COLORS.muted).text(`${amount.toLocaleString()} EGP`, 505, chartY + 3, { align: 'right', width: 50 });

        chartY += 28;
    });

    if (incomeCategories.length === 0) {
        doc.fontSize(11).fillColor(COLORS.muted).text('No income data for this period', 40, chartY);
        chartY += 25;
    }

    // ========== RECENT TRANSACTIONS TABLE ==========
    chartY += 30;

    // Check if we need a new page
    if (chartY > 600) {
        doc.addPage();
        chartY = 50;
    }

    doc.fontSize(14).fillColor(COLORS.text).text('📋 Recent Transactions', 40, chartY);
    chartY += 25;

    // Table header
    drawRoundedRect(doc, 40, chartY, 515, 25, 5, COLORS.light);
    doc.fontSize(9).fillColor(COLORS.muted);
    doc.text('DATE', 50, chartY + 8);
    doc.text('TYPE', 120, chartY + 8);
    doc.text('CATEGORY', 190, chartY + 8);
    doc.text('SOURCE', 310, chartY + 8);
    doc.text('AMOUNT', 450, chartY + 8, { align: 'right', width: 95 });
    chartY += 30;

    // Table rows
    transactions.slice(0, 12).forEach((tx, i) => {
        const rowY = chartY + (i * 24);

        if (rowY > 750) return; // Skip if too close to bottom

        // Alternating row background
        if (i % 2 === 0) {
            doc.rect(40, rowY - 2, 515, 22).fill('#fafafa');
        }

        const date = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const typeColor = tx.type === 'Income' ? COLORS.income : tx.type === 'Expense' ? COLORS.expense : COLORS.investment;

        doc.fontSize(9).fillColor(COLORS.text).text(date, 50, rowY + 5);
        doc.fillColor(typeColor).text(tx.type, 120, rowY + 5);
        doc.fillColor(COLORS.text).text(tx.category.substring(0, 15), 190, rowY + 5);
        doc.fillColor(COLORS.muted).text((tx.source || '-').substring(0, 15), 310, rowY + 5);

        const amountStr = `${tx.type === 'Income' ? '+' : '-'}${parseFloat(tx.amount).toLocaleString()}`;
        doc.fillColor(typeColor).text(amountStr, 450, rowY + 5, { align: 'right', width: 95 });
    });

    if (transactions.length === 0) {
        doc.fontSize(11).fillColor(COLORS.muted).text('No transactions in this period', 40, chartY + 10);
    }

    if (transactions.length > 12) {
        doc.fontSize(9).fillColor(COLORS.muted).text(
            `+ ${transactions.length - 12} more transactions not shown`,
            40, chartY + (Math.min(transactions.length, 12) * 24) + 10
        );
    }

    // ========== FOOTER ==========
    const footerY = 780;
    doc.fontSize(8).fillColor(COLORS.muted).text(
        `Generated on ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${now.toLocaleTimeString()}`,
        40, footerY, { align: 'center', width: 515 }
    );
    doc.text('Finance PRO Dashboard • Personal Finance Management', 40, footerY + 12, { align: 'center', width: 515 });

    doc.end();

    return new Promise((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
};

// GET /api/reports/weekly
router.get('/weekly', async (req, res) => {
    try {
        const { userId } = req.user;
        const pdfBuffer = await generatePDF(userId, 'weekly');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Weekly_Report_${new Date().toISOString().split('T')[0]}.pdf`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error('Error generating weekly report:', err);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// GET /api/reports/monthly
router.get('/monthly', async (req, res) => {
    try {
        const { userId } = req.user;
        const pdfBuffer = await generatePDF(userId, 'monthly');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Monthly_Report_${new Date().toISOString().split('T')[0]}.pdf`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error('Error generating monthly report:', err);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

export default router;
