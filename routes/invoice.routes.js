import express from 'express';
import { 
    getInvoices, 
    createInvoice, 
    updateInvoice, 
    deleteInvoice 
} from '../controllers/invoice.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

// Rutas principales de facturas
router.route('/')
    .get(authorize('invoices.view'), getInvoices)
    .post(authorize('invoices.create'), createInvoice);

// Rutas para una factura específica
router.route('/:id')
    .put(authorize('invoices.edit', 'invoices.changeStatus'), updateInvoice)
    .delete(authorize('invoices.delete'), deleteInvoice); // Esta ahora solo anula localmente

export default router;