import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectsDirectory = path.join(rootDirectory, 'projects');
const manifestPath = path.join(projectsDirectory, 'manifest.json');
const imageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);

const toWebPath = (filePath) => path.relative(rootDirectory, filePath).split(path.sep).join('/');

const getFirstImage = async (projectDirectory) => {
  const imagesDirectory = path.join(projectDirectory, 'images');

  try {
    const imageEntries = await fs.readdir(imagesDirectory, { withFileTypes: true });
    const firstImage = imageEntries
      .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))[0];

    return firstImage ? toWebPath(path.join(imagesDirectory, firstImage)) : undefined;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
};

const normalizeUrls = (description) => {
  if (Array.isArray(description.urls)) {
    return description.urls;
  }

  if (description.url) {
    return [{
      cta: 'View live project →',
      link: description.url
    }];
  }

  return [];
};

const normalizeProject = async (directoryName) => {
  const projectDirectory = path.join(projectsDirectory, directoryName);
  const descriptionPath = path.join(projectDirectory, 'description.json');
  const description = JSON.parse(await fs.readFile(descriptionPath, 'utf8'));
  const image = description.image || await getFirstImage(projectDirectory);

  return {
    slug: directoryName,
    title: description.title,
    summary: description.summary,
    techStack: description.techStack || description['tech-stack'] || [],
    urls: normalizeUrls(description),
    category: description.category,
    ...(image ? { image } : {})
  };
};

const projectDirectories = (await fs.readdir(projectsDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

const projects = await Promise.all(projectDirectories.map(normalizeProject));

await fs.writeFile(manifestPath, `${JSON.stringify(projects, null, 2)}\n`);

console.log(`Generated ${toWebPath(manifestPath)} with ${projects.length} projects.`);
