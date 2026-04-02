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

function renderDownloads(downloads) {
  downloadsList.innerHTML = '';

  if (!downloads.length) {
    const empty = document.createElement('li');
    empty.innerHTML = '<strong>No downloads yet.</strong><span>Your saved videos will appear here.</span>';
    downloadsList.appendChild(empty);
    return;
  }

  for (const file of downloads) {
    const item = document.createElement('li');
    item.innerHTML = `
      <strong>${file.name}</strong>
      <span>${formatBytes(file.sizeBytes)} • ${new Date(file.modifiedAt).toLocaleString()}</span>
      <span>${file.path}</span>
    `;
    downloadsList.appendChild(item);
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
  updateStatus('Working through the Zoom page and downloading your file. Keep this tab open.', 'busy');

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

    const fileSummary = result.files.map(file => file.outputPath).join('\n');
    updateStatus(`${result.message}\n${fileSummary}`, 'success');
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
