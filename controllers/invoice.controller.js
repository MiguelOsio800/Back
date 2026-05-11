import { Invoice, CompanyInfo, Client, Office, sequelize, Remesa } from '../models/index.js';
import { Op } from 'sequelize';

export const getInvoices = async (req, res) => {
    try {
        const { user } = req;
        const whereClause = {};

        const globalRoles = ['role-admin', 'role-tecnologia', 'role-soporte']; 

        if (user && !globalRoles.includes(user.roleId)) {
            if (user.officeId) {
                whereClause.officeId = user.officeId;
            } else {
                whereClause.id = null;
            }
        }

        const invoices = await Invoice.findAll({ 
            where: whereClause, 
            order: [['invoiceNumber', 'DESC']],
            include: [
                { model: Office, attributes: ['name', 'code'] },
                { model: Remesa, attributes: ['remesaNumber', 'date'] } 
            ]
        });
        
        res.json(invoices);
    } catch (error) {
        console.error("Error al obtener las facturas:", error);
        res.status(500).json({ message: 'Error al obtener las facturas', error: error.message });
    }
};
        
export const createInvoice = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { guide, montoFlete, insuranceAmount, discountAmount,specificDestination, ...invoiceData } = req.body;
        const { sender, receiver } = guide;

        if (req.user.roleId !== 'role-admin') {
            guide.originOfficeId = req.user.officeId;
        } else if (!guide.originOfficeId) {
            guide.originOfficeId = req.user.officeId;
        }

        const getValidClientData = ({ idNumber, clientType, name, phone, address, email }) => ({
            idNumber, clientType, name, phone, address, email
        });

        const [senderClient] = await Client.findOrCreate({
            where: { idNumber: sender.idNumber },
            defaults: { ...getValidClientData(sender), id: `C-${Date.now()}` },
            transaction: t
        });
        const [receiverClient] = await Client.findOrCreate({
            where: { idNumber: receiver.idNumber },
            defaults: { ...getValidClientData(receiver), id: `C-${Date.now() + 1}` },
            transaction: t
        });

        const userOfficeId = req.user?.officeId;
        if (!userOfficeId) throw new Error('No se pudo determinar la oficina del usuario.');

        const office = await Office.findByPk(userOfficeId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!office || !office.code) throw new Error(`La oficina no tiene un CÓDIGO (Serie) asignado.`);
        
        const nextInvoiceNum = (office.lastInvoiceNumber || 0) + 1;
        const newInvoiceNumberFormatted = `${office.code}-${String(nextInvoiceNum).padStart(6, '0')}`;
        const newControlNumber = String(nextInvoiceNum).padStart(8, '0');
        
        office.lastInvoiceNumber = nextInvoiceNum;
        await office.save({ transaction: t });

        const company = await CompanyInfo.findByPk(1, { transaction: t });
        const costoManejoFijo = company ? parseFloat(company.costPerKg || 0) : 0;

        const pesoKg = parseFloat(guide.weight || 0);
        const fleteIngresado = parseFloat(montoFlete || 0);
        let calculadoIpostel = 0;

        if (pesoKg <= 30.9) {
            calculadoIpostel = fleteIngresado * 0.06;
        }

        const seguro = parseFloat(insuranceAmount || 0);
        const descuento = parseFloat(discountAmount || 0);
        // NOTA: 'iva' se asume que viene calculado desde el frontend o se declara aquí
        const iva = parseFloat(req.body.montoIva || 0); 
        const subtotalCalculado = fleteIngresado + costoManejoFijo + calculadoIpostel + seguro;
        const totalFinal = parseFloat(invoiceData.totalAmount) || (subtotalCalculado + iva - descuento);

        const sanitizedEmail = senderClient.email && senderClient.email.trim() !== "" 
        ? senderClient.email 
        : null;

        const newInvoice = await Invoice.create({
            id: `INV-${Date.now()}`,
            invoiceNumber: newInvoiceNumberFormatted,
            controlNumber: newControlNumber,
            clientName: senderClient.name,
            clientIdNumber: senderClient.idNumber,
            clientEmail: sanitizedEmail,
            date: invoiceData.date,
            specificDestination: specificDestination,
            destinationOfficeId: guide.destinationOfficeId || null,
            receiverName: receiverClient.name,
            receiverIdNumber: receiverClient.idNumber,
            receiverAddress: receiverClient.address,
            receiverPhone: receiverClient.phone,
            receiverEmail: receiverClient.email,
            montoFlete: fleteIngresado,
            Montomanejo: costoManejoFijo,
            ipostelFee: calculadoIpostel,
            insuranceAmount: seguro,
            montoIva: iva,
            discountAmount: descuento,
            totalAmount: totalFinal,
            officeId: userOfficeId,
            guide: { 
                ...guide, 
                sender: { ...sender, id: senderClient.id }, 
                receiver: { ...receiver, id: receiverClient.id } 
            },
            status: 'Activa',
            paymentStatus: guide.paymentType === 'flete-pagado' ? 'Pagada' : 'Pendiente',
            shippingStatus: 'Pendiente para Despacho',
            createdByName: invoiceData.createdByName || 'Sistema'
        }, { transaction: t });
        
        await t.commit();
        res.status(201).json(newInvoice);

    } catch (error) {
        if (t) await t.rollback();
        console.error('Error al crear la factura:', error);
        res.status(500).json({ message: error.message || 'Error al crear la factura' });
    }
};

export const updateInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findByPk(req.params.id);
        if (!invoice) return res.status(404).json({ message: 'Factura no encontrada' });
        
        const rateToUse = req.body.exchangeRate || invoice.exchangeRate;

        const { 
            exchangeRate,
            totalAmount, 
            montoFlete, 
            Montomanejo, 
            ipostelFee,
            insuranceAmount, 
            discountAmount,
            montoIva,
            guide, 
            ...safeUpdateData 
        } = req.body;

        const updatedGuide = guide ? { ...invoice.guide, ...guide } : invoice.guide;

        const fleteIngresado = parseFloat(montoFlete !== undefined ? montoFlete : invoice.montoFlete || 0);
        const manejo = parseFloat(Montomanejo !== undefined ? Montomanejo : invoice.Montomanejo || 0);
        const seguro = parseFloat(insuranceAmount !== undefined ? insuranceAmount : invoice.insuranceAmount || 0);
        const descuento = parseFloat(discountAmount !== undefined ? discountAmount : invoice.discountAmount || 0);
        const iva = parseFloat(montoIva !== undefined ? montoIva : invoice.montoIva || 0);

        const pesoKg = parseFloat(updatedGuide?.weight || 0);

        let calculadoIpostel = 0;
        
        if (pesoKg > 0 && pesoKg <= 30.9) {
            calculadoIpostel = fleteIngresado * 0.06;
        } else if (pesoKg === 0 && ipostelFee !== undefined) {
            calculadoIpostel = parseFloat(ipostelFee);
        }

        const totalFinal = parseFloat(totalAmount) || ((fleteIngresado + manejo + calculadoIpostel + seguro + iva) - descuento);

        await invoice.update({
            ...safeUpdateData,
            guide: updatedGuide, 
            destinationOfficeId: updatedGuide?.destinationOfficeId || invoice.destinationOfficeId, 
            montoFlete: fleteIngresado,
            Montomanejo: manejo,
            ipostelFee: calculadoIpostel,
            insuranceAmount: seguro,
            montoIva: iva,
            discountAmount: descuento,
            totalAmount: totalFinal,
            exchangeRate: rateToUse
        });
        
        const freshInvoice = await Invoice.findByPk(req.params.id, { include: ['Office'] });
        
        res.json(freshInvoice);
    } catch (error) {
        console.error('Error en updateInvoice:', error);
        res.status(500).json({ message: 'Error al actualizar', error: error.message });
    }
};

export const deleteInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findByPk(req.params.id, { include: [Office] });
        if (!invoice) return res.status(404).json({ message: 'Factura no encontrada' });

        // Eliminamos llamada a HKA, solo actualizamos localmente
        await invoice.update({ status: 'Anulada' });

        res.json({ message: 'Factura anulada con éxito localmente' });
    } catch (error) {
        console.error('Error al anular factura:', error.message);
        res.status(500).json({ message: 'No se pudo anular: ' + error.message });
    }
};

