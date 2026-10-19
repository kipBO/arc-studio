import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const starterDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../starter-projects');
const projectFiles = new Set([
  'graphs.json',
  'graph-library.json',
  'bot-config.json',
  'statistics.json',
  'embeds.json',
  'project-variables.json'
]);

function loadStarters() {
  const ids = new Set();
  const starters = fs.readdirSync(starterDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.arcproject'))
    .map((entry) => {
      const filePath = path.join(starterDirectory, entry.name);
      const bundle = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const metadata = bundle?.project?.starter;
      if (bundle?.format !== 'arc-project' || bundle.version !== 1 || !metadata || !/^[a-z][a-z0-9-]{0,63}$/.test(metadata.id || '') || entry.name !== `${metadata.id}.arcproject`) {
        throw new Error(`Starter project ${entry.name} has invalid ARC project metadata.`);
      }
      if (ids.has(metadata.id)) throw new Error(`Starter project ID “${metadata.id}” is duplicated.`);
      ids.add(metadata.id);
      if (typeof metadata.name !== 'string' || !metadata.name.trim() || typeof metadata.description !== 'string' || !metadata.description.trim()) {
        throw new Error(`Starter project ${entry.name} needs a name and description.`);
      }
      if (!bundle.files || typeof bundle.files !== 'object' || Array.isArray(bundle.files)) {
        throw new Error(`Starter project ${entry.name} has no project file set.`);
      }
      for (const file of Object.keys(bundle.files)) {
        if (!projectFiles.has(file)) throw new Error(`Starter project ${entry.name} contains unsupported project file ${file}.`);
      }
      if (!Array.isArray(bundle.files['graphs.json']?.graphs) || !Array.isArray(bundle.files['project-variables.json'])) {
        throw new Error(`Starter project ${entry.name} has invalid graph or variable data.`);
      }
      return Object.freeze({
        id: metadata.id,
        name: metadata.name.trim(),
        description: metadata.description.trim(),
        icon: String(metadata.icon || 'PackageOpen'),
        highlights: Array.isArray(metadata.highlights) ? metadata.highlights.filter((item) => typeof item === 'string').slice(0, 8) : [],
        setup: Array.isArray(metadata.setup) ? metadata.setup.filter((item) => typeof item === 'string').slice(0, 8) : [],
        order: Number.isInteger(metadata.order) ? metadata.order : 100,
        files: bundle.files
      });
    });

  if (!ids.has('blank')) throw new Error('The blank starter project is missing.');
  return Object.freeze(starters.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)));
}

export const StarterProjects = loadStarters();

export function getStarterProject(id) {
  return StarterProjects.find((starter) => starter.id === id);
}
