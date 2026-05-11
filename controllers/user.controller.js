import { User } from '../models/index.js';
import { generateUniqueId } from '../utils/idGenerator.js';

// @desc    Obtener todos los usuarios
// @route   GET /api/users
export const getUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: { exclude: ['password'] },
            order: [['name', 'ASC']],
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
    }
};

// @desc    Crear un nuevo usuario
// @route   POST /api/users
export const createUser = async (req, res) => {
    // Agregamos asociadoId al destructuring
    const { name, username, password, roleId, officeId, asociadoId } = req.body;
    try {
        const newUser = await User.create({
            id: generateUniqueId('user'),
            id: `user-${Date.now()}`,
            name,
            username,
            password,
            roleId,
            // Si viene vacío o undefined, lo guardamos como null
            officeId: officeId || null,
            asociadoId: asociadoId || null,
        });
        const { password: _, ...userWithoutPassword } = newUser.toJSON();
        res.status(201).json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ message: 'Error al crear el usuario', error: error.message });
    }
};

// @desc    Actualizar un usuario
// @route   PUT /api/users/:id
export const updateUser = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        
        // 💡 BLINDAJE: Si la contraseña no existe O es puro espacio en blanco, la eliminamos de la actualización
        if (!req.body.password || req.body.password.trim() === '') {
            delete req.body.password;
        }

        const dataToUpdate = {
            ...req.body,
            officeId: req.body.officeId || null, 
            asociadoId: req.body.asociadoId || null
        };

        await user.update(dataToUpdate);
        const { password, ...userWithoutPassword } = user.toJSON();
        res.json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar el usuario', error: error.message });
    }
};

// @desc    Eliminar un usuario
// @route   DELETE /api/users/:id
export const deleteUser = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        await user.destroy();
        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar el usuario', error: error.message });
    }
};

export const updateProfile = async (req, res) => {
    try {
        // Obtenemos el usuario basado en el token, no en req.params
        const user = await User.findByPk(req.user.id); 
        
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        
        // Extraemos SOLO los campos seguros que el usuario puede editarse a sí mismo
        const { name, password } = req.body;
        
        const dataToUpdate = {};
        if (name) dataToUpdate.name = name;
        
        // Si mandó contraseña y no está vacía, la actualizamos
        if (password && password.trim() !== '') {
             dataToUpdate.password = password; 
             // (Nota: Asegúrate de que el modelo o un hook haga el hash de la contraseña si no lo hace el controlador)
        }

        // NO permitimos que el usuario cambie su propio rol, oficina o asociado por aquí
        
        await user.update(dataToUpdate);
        
        const { password: _, ...userWithoutPassword } = user.toJSON();
        res.json(userWithoutPassword);
        
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar el perfil', error: error.message });
    }
};