const form = document.getElementById('download-form');
const statusNode = document.getElementById('status');
const downloadsList = document.getElementById('downloads-list');
const submitButton = document.getElementById('submit-button');

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function updateStatus(message, tone = 'idle') {
  statusNode.className = `status ${tone}`;
  statusNode.textContent = message;
}

function createDownloadLink(file) {
  const link = document.createElement('a');
  link.className = 'download-link';
  link.href = file.downloadUrl;
  link.download = file.name || file.filename;
  link.textContent = 'Download to browser';
  return link;
}

function renderDownloads(downloads) {
  downloadsList.innerHTML = '';

  if (!downloads.length) {
    const empty = document.createElement('li');
    const title = document.createElement('strong');
    const note = document.createElement('span');
    title.textContent = 'No downloads yet.';
    note.textContent = 'Your saved videos will appear here.';
    empty.append(title, note);
    downloadsList.appendChild(empty);
    return;
  }

  for (const file of downloads) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    const pathNode = document.createElement('span');

    title.textContent = file.name;
    meta.textContent = `${formatBytes(file.sizeBytes)} • ${new Date(file.modifiedAt).toLocaleString()}`;
    pathNode.textContent = `Stored on server: ${file.serverPath}`;

    item.append(title, meta, pathNode, createDownloadLink(file));
    downloadsList.appendChild(item);
  }
}

function triggerBrowserDownloads(files) {
  for (const file of files) {
    if (!file.downloadUrl) {
      continue;
    }

    const link = document.createElement('a');
    link.href = file.downloadUrl;
    link.download = file.filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

async function refreshDownloads() {
  const response = await fetch('/api/downloads');
  const payload = await response.json();
  renderDownloads(payload.downloads || []);
}

form.addEventListener('submit', async event => {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = {
    url: formData.get('url'),
    password: formData.get('password'),
    filename: formData.get('filename'),
    browserPath: formData.get('browserPath'),
  };

  submitButton.disabled = true;
  updateStatus('Working through the Zoom page and preparing a browser download. Keep this tab open.', 'busy');

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'Download failed.');
    }

    triggerBrowserDownloads(result.files || []);
    updateStatus(
      `${result.message}\nChrome should now save a copy into its default Downloads folder as well.`,
      'success'
    );
    renderDownloads(result.downloads || []);
    form.reset();
  } catch (error) {
    updateStatus(error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
});

refreshDownloads().catch(() => {
  updateStatus('The interface loaded, but the downloads list could not be fetched.', 'error');
});
