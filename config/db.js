const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'kafei',         // Reemplaza con tu usuario de MySQL
    password: '10102010',   // Reemplaza con tu contraseña de MySQL
    database: 'MCTechBD'         // Nombre de la base de datos
});

connection.connect((error) => {
    if (error) {
        console.error('Error conectando a la base de datos:', error);
        return;
    }
    console.log('Conexión exitosa a la base de datos');
});

module.exports = connection;
