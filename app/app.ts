import express from 'express';
import mysql from 'mysql2';
import AWS from 'aws-sdk';

// Create a new instance of the SecretsManager client
const secretsManager = new AWS.SecretsManager();

const app = express();
const port = 80;

// Function to retrieve the credentials from AWS Secrets Manager
const getDbCredentials = async () => {
  try {
    const data = await secretsManager
      .getSecretValue({ SecretId: 'ProdAppStackProdAppDbSecret-KOmBNKvh6aDq' })
      .promise();

    if (!data.SecretString) {
      throw new Error('SecretString is empty.');
    }

    const secret = JSON.parse(data.SecretString);

    if (!secret.host || !secret.username || !secret.password || !secret.dbname || !secret.port) {
      throw new Error('Incomplete database credentials.');
    }

    return {
      host: secret.host,
      user: secret.username,
      password: secret.password,
      database: secret.dbname,
      port: secret.port,
    };
  } catch (err) {
    console.error('Error fetching secret:', err);
    throw new Error('Failed to fetch database credentials.');
  }
};

// Create a MySQL connection pool
const createDbConnection = async () => {
  const dbConfig = await getDbCredentials();

  return mysql.createPool(dbConfig);
};
app.get('/health', (req, res) => {
  res.status(200).send('Health check successful!');
});

app.get('/', async (req: express.Request, res: express.Response) => {
  try {
    const pool = await createDbConnection();

    pool.query('SELECT content FROM messages', (err, results: Array<{ content: string }>) => {
      if (err) {
        console.error('Query error:', err);
        res.status(500).send('Error querying database.');
      } else if (results && results.length > 0) {
        res.send(`Message from DB: ${results[0].content}`);
      } else {
        res.send('No content found in the database.');
      }
    });
  } catch (err) {
    console.error('Connection error:', err);
    res.status(500).send('Error connecting to database.');
  }
});

app.listen(port, () => {
  console.log(`App running at http://localhost:${port}`);
});
