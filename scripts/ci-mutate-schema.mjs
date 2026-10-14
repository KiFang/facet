// CI: делает из club-schema.json «следующую версию» — так же, как это сделал бы редактор.
// node scripts/ci-mutate-schema.mjs <in.json> <out.json>
import fs from 'node:fs';

const [input, output] = process.argv.slice(2);
const schema = JSON.parse(fs.readFileSync(input, 'utf8'));
const members = schema.entities.find((e) => e.id === 'members');
const fullName = members.fields.find((f) => f.id === 'full_name');
fullName.uid = 'full_name'; // переименование колонки, а не удаление
fullName.id = 'name';
members.fields.push({ id: 'email', name: 'Почта', type: 'text', required: false });
schema.clubName = `${schema.clubName} v2`;
fs.writeFileSync(output, `${JSON.stringify(schema, null, 2)}\n`);
