const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'mctech-irapuato-5f24.g.aivencloud.com',
    port: 21630, // Reemplaza por el puerto correcto
    user: 'avnadmin',         // Reemplaza con tu usuario de MySQL
    password: 'AVNS_GGJJyjkTHRLbq7PRGKQ',   // Reemplaza con tu contraseña de MySQL
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
