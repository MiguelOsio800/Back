import express from 'express';
import { getExpenses, createExpense, updateExpense, deleteExpense } from '../controllers/expense.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(authorize('gastos.view'), getExpenses)      // Cambiado a gastos.*
    .post(authorize('gastos.create'), createExpense); // Cambiado a gastos.*

router.route('/:id')
    .put(authorize('gastos.edit'), updateExpense)    // Cambiado a gastos.*
    .delete(authorize('gastos.delete'), deleteExpense); // Cambiado a gastos.*

export default router;