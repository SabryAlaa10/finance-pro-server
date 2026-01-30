import express from 'express';
import pool from '../config/db.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyToken);

// GET /api/transactions - Get all transactions for user
router.get('/', async (req, res) => {
    try {
        const { userId } = req.user;

        const result = await pool.query(
            `SELECT id, date, type, category, source, amount, description
       FROM transactions
       WHERE user_id = $1
       ORDER BY date DESC`,
            [userId]
        );

        res.json({ transactions: result.rows });
    } catch (err) {
        console.error('Error fetching transactions:', err);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// POST /api/transactions - Add new transaction
router.post('/', async (req, res) => {
    try {
        const { userId } = req.user;
        const { date, type, category, source, amount, description } = req.body;

        if (!date || !type || !category || !source || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await pool.query(
            `INSERT INTO transactions (user_id, date, type, category, source, amount, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
            [userId, date, type, category, source, parseFloat(amount), description || '']
        );

        res.status(201).json({ transaction: result.rows[0], message: 'Transaction saved successfully' });
    } catch (err) {
        console.error('Error saving transaction:', err);
        res.status(500).json({ error: 'Failed to save transaction' });
    }
});

// GET /api/transactions/stats - Get dashboard statistics
router.get('/stats', async (req, res) => {
    try {
        const { userId } = req.user;

        // Get totals
        const totalsResult = await pool.query(
            `SELECT 
        COALESCE(SUM(CASE WHEN type = 'Income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN type = 'Investment' THEN amount ELSE 0 END), 0) as investments_value
       FROM transactions
       WHERE user_id = $1`,
            [userId]
        );

        const stats = totalsResult.rows[0];
        stats.net_balance = parseFloat(stats.total_income) - parseFloat(stats.total_expenses);

        // Get monthly data for chart
        const monthlyResult = await pool.query(
            `SELECT 
        TO_CHAR(date, 'YYYY-MM') as month,
        type,
        SUM(amount) as amount
       FROM transactions
       WHERE user_id = $1
       GROUP BY TO_CHAR(date, 'YYYY-MM'), type
       ORDER BY month`,
            [userId]
        );

        // Get expense breakdown by category
        const categoryResult = await pool.query(
            `SELECT category, SUM(amount) as amount
       FROM transactions
       WHERE user_id = $1 AND type = 'Expense'
       GROUP BY category
       ORDER BY amount DESC`,
            [userId]
        );

        res.json({
            stats: {
                totalIncome: parseFloat(stats.total_income),
                totalExpenses: parseFloat(stats.total_expenses),
                netBalance: stats.net_balance,
                investmentsValue: parseFloat(stats.investments_value)
            },
            monthlyData: monthlyResult.rows,
            expensesByCategory: categoryResult.rows
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// DELETE /api/transactions/:id - Delete a transaction
router.delete('/:id', async (req, res) => {
    try {
        const { userId } = req.user;
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        res.json({ message: 'Transaction deleted successfully' });
    } catch (err) {
        console.error('Error deleting transaction:', err);
        res.status(500).json({ error: 'Failed to delete transaction' });
    }
});

export default router;
