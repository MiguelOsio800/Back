import express from 'express';
import { getUsers, createUser, updateUser, deleteUser, updateProfile } from '../controllers/user.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

// Todas las rutas requieren estar logueado
router.use(protect);

// NUEVA RUTA: Para que el usuario edite su PROPIO perfil (Solo requiere estar logueado)
router.put('/profile', updateProfile);

// A partir de aquí, las rutas administrativas SI requieren permiso
router.use(authorize('config.users.manage'));

router.route('/')
    .get(getUsers)
    .post(createUser);

router.route('/:id')
    .put(updateUser)
    .delete(deleteUser);

export default router;