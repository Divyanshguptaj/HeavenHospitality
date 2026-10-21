const { pool } = require('../config/db');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const snake = (name) => name.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

const createRepository = ({ table, fields, columnOverrides = {}, defaultOrder = 'created_at DESC' }) => {
  const columns = Object.fromEntries(fields.map((name) => [name, columnOverrides[name] || snake(name)]));

  const toDocument = (row) => {
    if (!row) return null;
    const doc = { _id: row.id };
    for (const [name, column] of Object.entries(columns)) doc[name] = row[column];
    doc.createdAt = row.created_at;
    doc.updatedAt = row.updated_at;
    return doc;
  };

  const pick = (data) => Object.entries(columns).filter(([name]) => data[name] !== undefined);

  const list = async (orderBy = defaultOrder) => {
    const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
    return rows.map(toDocument);
  };

  const findById = async (id) => {
    if (!UUID_PATTERN.test(id)) return null;
    const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    return toDocument(rows[0]);
  };

  const create = async (data) => {
    const entries = pick(data);
    const sql = entries.length
      ? `INSERT INTO ${table} (${entries.map(([, column]) => column).join(', ')}) VALUES (${entries.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`
      : `INSERT INTO ${table} DEFAULT VALUES RETURNING *`;
    const { rows } = await pool.query(sql, entries.map(([name]) => data[name]));
    return toDocument(rows[0]);
  };

  const update = async (id, data) => {
    if (!UUID_PATTERN.test(id)) return null;
    const entries = pick(data);
    if (entries.length === 0) return findById(id);
    const assignments = entries.map(([, column], i) => `${column} = $${i + 2}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE ${table} SET ${assignments}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...entries.map(([name]) => data[name])],
    );
    return toDocument(rows[0]);
  };

  const remove = async (id) => {
    if (!UUID_PATTERN.test(id)) return null;
    const { rows } = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id]);
    return toDocument(rows[0]);
  };

  const query = async (sql, params = []) => {
    const { rows } = await pool.query(sql, params);
    return rows.map(toDocument);
  };

  return { table, list, findById, create, update, remove, query, toDocument };
};

module.exports = { createRepository, UUID_PATTERN };
