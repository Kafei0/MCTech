    const express = require('express');
    const session = require('express-session');
    const db = require('./config/db');
    const bcrypt = require('bcryptjs');
    const path = require('path');
    const app = express();

    // Configurar la carpeta 'public' como carpeta estática
    app.use(express.static(path.join(__dirname, 'public')));

    // Configuración de middlewares
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(session({
        secret: 'mi_secreto',
        resave: false,
        saveUninitialized: true
    }));

    // Configura EJS como motor de plantillas
    app.set('view engine', 'ejs');

    // Middlewares de verificación de roles
    const checkAuthenticated = (req, res, next) => {
        if (req.session.userId) {
            return next();
        }
        res.redirect('/login');
    };

    const checkRole = (role) => {
        return (req, res, next) => {
            if (req.session.userRole === role) {
                return next();
            }
            res.redirect('/login');
        };
    };

    // Ruta para mostrar el formulario de login
    app.get('/login', (req, res) => {
        res.render('login');
    });

    // Ruta para procesar el inicio de sesión
    app.post('/login', (req, res) => {
        const { email, password } = req.body;

        const query = `SELECT * FROM Usuarios WHERE EMAIL = ?`;
        db.query(query, [email], (error, results) => {
            if (error) return res.status(500).send('Error en la base de datos');
            if (results.length === 0) return res.status(401).send('Correo o contraseña incorrectos');

            const user = results[0];

            // Verificar contraseña
            bcrypt.compare(password, user.PASSWORD, (err, isMatch) => {
                if (err) return res.status(500).send('Error en la autenticación');
                if (!isMatch) return res.status(401).send('Correo o contraseña incorrectos');

                // Inicio de sesión exitoso
                req.session.userId = user.ID;
                req.session.userRole = user.ROL;

                // Redirigir según el rol
                res.redirect(user.ROL === 'Fisioterapeuta' ? '/dashboard' : '/patient-dashboard');
            });
        });
    });

    // Ruta para mostrar el formulario de registro
    app.get('/register', (req, res) => {
        res.render('register');
    });

    // Ruta para procesar el registro de nuevos usuarios
    app.post('/register', async (req, res) => {
        const { nombre, email, password, rol } = req.body;

        db.query(`SELECT * FROM Usuarios WHERE EMAIL = ?`, [email], async (error, results) => {
            if (results.length > 0) return res.status(400).send('El correo ya está registrado');

            const hashedPassword = await bcrypt.hash(password, 10);
            const query = `INSERT INTO Usuarios (EMAIL, PASSWORD, ROL) VALUES (?, ?, ?)`;

            db.query(query, [email, hashedPassword, rol], (error, result) => {
                if (error) return res.status(500).send('Error al registrar el usuario');

                const userId = result.insertId;

                if (rol === 'Fisioterapeuta') {
                    const fisioterapeutaQuery = `INSERT INTO Fisioterapeuta (ID, NOMBRE, EMAIL) VALUES (?, ?, ?)`;
                    db.query(fisioterapeutaQuery, [userId, nombre, email], (error) => {
                        if (error) return res.status(500).send('Error al registrar fisioterapeuta');
                        res.redirect('/login');
                    });
                } else if (rol === 'Paciente') {
                    const pacienteQuery = `INSERT INTO Paciente (NOMBRE, FisioterapeutaID) VALUES (?, NULL)`;
                    db.query(pacienteQuery, [nombre], (error) => {
                        if (error) return res.status(500).send('Error al registrar paciente');
                        res.redirect('/login');
                    });
                }
            });
        });
    });

    // Ruta para el panel del fisioterapeuta
    app.get('/dashboard', checkAuthenticated, checkRole('Fisioterapeuta'), (req, res) => {
        const fisioterapeutaID = req.session.userId;
        const query = `SELECT * FROM Paciente WHERE FisioterapeutaID = ?`;

        db.query(query, [fisioterapeutaID], (error, results) => {
            if (error) return res.status(500).send('Error al obtener pacientes');
            res.render('dashboard-fisioterapeuta', { pacientes: results });
        });
    });

    // Ruta para el panel del paciente
    app.get('/patient-dashboard', checkAuthenticated, checkRole('Paciente'), (req, res) => {
        const pacienteID = req.session.userId;

    const queryIncompletos = `SELECT e.ID, e.NOMBRE_EJERCICIO, ea.DURACION, e.VideoURL 
                              FROM EjercicioAsignado ea
                              JOIN Ejercicio e ON ea.EjercicioID = e.ID
                              WHERE ea.PacienteID = ? AND ea.ESTADO = 0`; // Ejercicios incompletos

    const queryCompletados = `SELECT e.ID, e.NOMBRE_EJERCICIO, ea.DURACION, e.VideoURL 
                              FROM EjercicioAsignado ea
                              JOIN Ejercicio e ON ea.EjercicioID = e.ID
                              WHERE ea.PacienteID = ? AND ea.ESTADO = 1`; // Ejercicios completados

    // Ejecutar ambas consultas en paralelo
    Promise.all([ 
        db.promise().query(queryIncompletos, [pacienteID]),
        db.promise().query(queryCompletados, [pacienteID])
    ])
    .then(([resultIncompletos, resultCompletados]) => {
        const ejerciciosIncompletos = resultIncompletos[0];
        const ejerciciosCompletados = resultCompletados[0];

        res.render('dashboard-paciente', {
            ejerciciosIncompletos,
            ejerciciosCompletados
        });
    })
    .catch(error => {
        console.error('Error al obtener ejercicios:', error);
        res.status(500).send('Error al cargar los ejercicios');
    });
});

    // Ruta para administrar pacientes
    app.get('/administrar-pacientes', checkAuthenticated, checkRole('Fisioterapeuta'), (req, res) => {
        const query = `SELECT * FROM Paciente WHERE FisioterapeutaID = ?`;
        db.query(query, [req.session.userId], (error, pacientes) => {
            if (error) return res.status(500).send('Error al obtener pacientes');
            res.render('dashboard-fisioterapeuta', { pacientes });
        });
    });

    // Ruta para añadir un paciente al fisioterapeuta
    app.post('/anadir-paciente', checkAuthenticated, checkRole('Fisioterapeuta'), (req, res) => {
        const { id } = req.body;
        const query = `UPDATE Paciente SET FisioterapeutaID = ? WHERE ID = ?`;

        db.query(query, [req.session.userId, id], (error, results) => {
            if (error) return res.status(500).send('Error al añadir paciente');
            res.status(results.affectedRows > 0 ? 200 : 404).send(results.affectedRows > 0 ? 'Paciente añadido exitosamente' : 'No se encontró el paciente para añadir');
        });
    });

    // Ruta para eliminar paciente
    app.post('/delete-patient/:id', checkAuthenticated, checkRole('Fisioterapeuta'), (req, res) => {
        const pacienteId = req.params.id;
        const query = `DELETE FROM Paciente WHERE ID = ?`;

        db.query(query, [pacienteId], (error) => {
            if (error) return res.status(500).send('Error al eliminar el paciente');
            res.redirect('/administrar-pacientes');
        });
    });

    // Ruta para obtener todos los pacientes no asignados
    app.get('/pacientes', checkAuthenticated, checkRole('Fisioterapeuta'), (req, res) => {
        const query = `SELECT * FROM Paciente WHERE FisioterapeutaID IS NULL`;
        db.query(query, (error, results) => {
            if (error) return res.status(500).send('Error al obtener pacientes');
            res.json(results);
        });
    });

    // Ruta para añadir ejercicios
    app.post('/anadir-ejercicio', checkAuthenticated, checkRole('Fisioterapeuta'), (req, res) => {
        const { pacienteId, ejercicioId, duracion } = req.body;

        const sql = 'INSERT INTO EjercicioAsignado (PacienteID, FisioterapeutaID, EjercicioID, DURACION, ESTADO) VALUES (?, ?, ?, ?, 0)';
        const params = [pacienteId, req.session.userId, ejercicioId, duracion];

        db.query(sql, params, (error, results) => {
            if (error) {
                return res.status(500).send('Error al añadir ejercicio: ' + error.message);
            }
            res.status(200).send('Ejercicio añadido exitosamente');
        });
    });

    // Ruta para añadir un nuevo paciente
    app.post('/agregar-paciente', async (req, res) => {
        const { nombre, notas, fisioterapeutaID } = req.body;

        try {
            const query = 'INSERT INTO Paciente (NOMBRE, NOTAS, FisioterapeutaID) VALUES (?, ?, ?)';
            await db.query(query, [nombre, notas, fisioterapeutaID]);
            res.redirect('/dashboard-fisioterapeuta'); // Redirigir después de agregar
        } catch (error) {
            console.error(error);
            res.status(500).send('Error al agregar paciente');
        }
    });

    // Ruta para obtener ejercicios
    app.get('/ejercicios', (req, res) => {
        const query = 'SELECT * FROM Ejercicio'; // O el nombre correcto de tu tabla
        db.query(query, (error, results) => {
            if (error) {
                return res.status(500).json({ error: 'Error al cargar ejercicios' });
            }
            res.json(results);
        });
    });

    // Ruta para actualizar el estado de un ejercicio
    app.post('/actualizar-estado-ejercicio/:id', checkAuthenticated, checkRole('Paciente'), (req, res) => {
        const ejercicioId = req.params.id;
        const query = `UPDATE EjercicioAsignado SET ESTADO = 1 WHERE EjercicioID = ? AND PacienteID = ?`;

        db.query(query, [ejercicioId, req.session.userId], (error, result) => {
            if (error) {
                console.error('Error al actualizar el estado del ejercicio:', error);
                return res.status(500).json({ success: false });
            }
            res.json({ success: true });
        });
    });

    app.listen(3000, () => {
        console.log('Servidor en ejecución en http://localhost:3000');
    });
