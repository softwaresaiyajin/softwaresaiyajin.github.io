import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectsDirectory = path.join(rootDirectory, 'projects');

const fallbackApps = {
  circlein: {
    id: '969803973',
    country: 'us'
  }
};

const getJson = async (url) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}: ${url}`);
  }

  return response.json();
};

const downloadFile = async (url, filePath) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed with ${response.status}: ${url}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, bytes);
};

const getFileExtension = (url) => {
  const pathname = new URL(url).pathname;
  const extension = path.extname(pathname).toLowerCase();
  return extension || '.jpg';
};

const getAppStoreInfo = (project, slug) => {
  const appStoreUrl = project.urls
    ?.map((url) => url.link)
    .find((link) => link.includes('apps.apple.com'));

  if (!appStoreUrl) {
    return fallbackApps[slug];
  }

  const url = new URL(appStoreUrl);
  const id = url.pathname.match(/id(\d+)/)?.[1];
  const country = url.pathname.split('/').filter(Boolean)[0] || 'us';

  return id ? { id, country } : fallbackApps[slug];
};

const lookupApp = async (project, slug) => {
  const appStoreInfo = getAppStoreInfo(project, slug);

  if (!appStoreInfo) {
    return undefined;
  }

  const lookup = await getJson(
    `https://itunes.apple.com/lookup?id=${appStoreInfo.id}&country=${appStoreInfo.country}`
  );

  if (lookup.results.length) {
    return lookup.results[0];
  }

  const fallback = fallbackApps[slug];

  if (!fallback || fallback.id === appStoreInfo.id) {
    return undefined;
  }

  const fallbackLookup = await getJson(
    `https://itunes.apple.com/lookup?id=${fallback.id}&country=${fallback.country}`
  );

  return fallbackLookup.results[0];
};

const loadProject = async (slug) => {
  const descriptionPath = path.join(projectsDirectory, slug, 'description.json');
  return JSON.parse(await fs.readFile(descriptionPath, 'utf8'));
};

const downloadAssets = async (slug) => {
  const project = await loadProject(slug);
  const app = await lookupApp(project, slug);

  if (!app) {
    console.warn(`Skipped ${slug}: App Store metadata unavailable.`);
    return;
  }

  const imagesDirectory = path.join(projectsDirectory, slug, 'images');
  const appIconDirectory = path.join(imagesDirectory, 'app-icon');
  const screenshotsDirectory = path.join(imagesDirectory, 'screenshots');

  await fs.mkdir(appIconDirectory, { recursive: true });
  await fs.mkdir(screenshotsDirectory, { recursive: true });

  if (app.artworkUrl512) {
    const iconExtension = getFileExtension(app.artworkUrl512);
    await downloadFile(app.artworkUrl512, path.join(appIconDirectory, `app-icon${iconExtension}`));
  }

  const screenshots = [
    ...(app.screenshotUrls || []),
    ...(app.ipadScreenshotUrls || [])
  ];

  await Promise.all(screenshots.map((screenshotUrl, index) => {
    const screenshotNumber = String(index + 1).padStart(2, '0');
    const screenshotExtension = getFileExtension(screenshotUrl);

    return downloadFile(
      screenshotUrl,
      path.join(screenshotsDirectory, `screenshot-${screenshotNumber}${screenshotExtension}`)
    );
  }));

  console.log(`Saved ${slug}: ${app.artworkUrl512 ? 1 : 0} icon, ${screenshots.length} screenshots.`);
};

const projectDirectories = (await fs.readdir(projectsDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

for (const slug of projectDirectories) {
  await downloadAssets(slug);
}
