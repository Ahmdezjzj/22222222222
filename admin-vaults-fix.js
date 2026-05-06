// ========== إضافة/تحديث Vault مع دعم مجلدات متعددة ==========
async function addVault() {
  const name = document.getElementById('vName').value.trim();
  const url = document.getElementById('vUrl').value.trim();
  const key = document.getElementById('vKey').value.trim();

  if (!name || !url || !key) {
    showAlert(document.getElementById('vaultAlert'), 'يرجى ملء جميع الحقول', 'error');
    return;
  }

  const alert = document.getElementById('vaultAlert');
  alert.classList.remove('show');

  try {
    const res = await api('/admin/vaults', {
      method: 'POST',
      body: JSON.stringify({
        name,
        url,
        api_key: key,
        root_paths: [] // سيتم إضافتها لاحقاً
      })
    });

    showAlert(alert, '✅ تم إضافة Vault بنجاح', 'success');
    document.getElementById('vName').value = '';
    document.getElementById('vUrl').value = '';
    document.getElementById('vKey').value = '';
    
    await loadVaults();
    setTimeout(() => loadVaults(), 500);
  } catch (e) {
    showAlert(alert, '❌ خطأ: ' + e.message, 'error');
  }
}

// ========== تحميل Vaults وإضافة زر إدارة المجلدات ==========
async function loadVaults() {
  try {
    const data = await api('/admin/vaults');
    vaultsList = data.vaults || [];

    const html = vaultsList.map(v => {
      const paths = v.root_paths ? JSON.parse(v.root_paths) : [];
      return `
        <div class="vault-card">
          <div class="vault-icon">🗄️</div>
          <div class="vault-info">
            <div class="vault-name">${v.name}</div>
            <div class="vault-url">${v.url}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">
              📁 ${paths.length > 0 ? paths.length + ' مجلد جذري' : 'بدون مجلدات محددة'}
            </div>
          </div>
          <div class="vault-actions">
            <button class="btn btn-secondary btn-sm" onclick="editVaultPaths(${v.id}, '${v.name}')">📁 إدارة المجلدات</button>
            <button class="btn btn-red btn-sm" onclick="deleteVault(${v.id})">🗑️ حذف</button>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('vaultsList').innerHTML = html || '<p style="color:var(--muted)">لم تضف أي Vaults بعد</p>';

    // تحديث قائمة الـ Vaults في استيراد الفصل
    const selects = ['impVault', 'impMVault'];
    selects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (select) {
        const current = select.value;
        select.innerHTML = '<option value="">-- اختر Vault --</option>' +
          vaultsList.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
        select.value = current;
      }
    });
  } catch (e) {
    document.getElementById('vaultsList').innerHTML = `<p style="color:#ef4444">خطأ: ${e.message}</p>`;
  }
}

// ========== إدارة المجلدات الجذرية ==========
async function editVaultPaths(vaultId, vaultName) {
  const vault = vaultsList.find(v => v.id === vaultId);
  if (!vault) return;

  const paths = vault.root_paths ? JSON.parse(vault.root_paths) : [];

  // عرض modal لإدارة المجلدات
  const modal = document.createElement('div');
  modal.id = 'pathsModal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  `;

  modal.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:30px;max-width:500px;width:90%">
      <h3 style="font-family:Cairo;font-size:18px;font-weight:900;margin-bottom:16px">📁 إدارة المجلدات الجذرية</h3>
      <p style="color:var(--muted);font-size:13px;margin-bottom:16px">أضف المجلدات الرئيسية في Vault (مثل: manga, manhwa, original)</p>

      <div id="pathsList" style="margin-bottom:16px;max-height:250px;overflow-y:auto"></div>

      <div style="display:flex;gap:8px;margin-bottom:16px">
        <input type="text" id="newPath" placeholder="أدخل مسار المجلد..." style="flex:1;padding:10px 14px;background:var(--surface);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-family:Tajawal,sans-serif;font-size:14px">
        <button class="btn btn-primary" onclick="addPathToVault('${vaultId}')">إضافة</button>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="savePaths('${vaultId}')" style="flex:1">💾 حفظ</button>
        <button class="btn btn-secondary" onclick="closePathsModal()" style="flex:1">إغلاق</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // تحميل المجلدات الحالية
  const pathsList = document.getElementById('pathsList');
  renderPaths(paths, pathsList, vaultId);
}

function renderPaths(paths, container, vaultId) {
  if (paths.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px">لم تضف أي مجلدات بعد</p>';
    return;
  }

  container.innerHTML = paths.map((p, i) => `
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
      <span>📁 ${p}</span>
      <button class="btn btn-red btn-sm" onclick="removePathFromVault('${vaultId}', ${i})">حذف</button>
    </div>
  `).join('');
}

// متغير مؤقت لتخزين المجلدات الجديدة
let tempPaths = [];

async function addPathToVault(vaultId) {
  const input = document.getElementById('newPath');
  const path = input.value.trim();

  if (!path) {
    alert('الرجاء إدخال مسار المجلد');
    return;
  }

  const vault = vaultsList.find(v => v.id === vaultId);
  tempPaths = vault.root_paths ? JSON.parse(vault.root_paths) : [];

  if (tempPaths.includes(path)) {
    alert('هذا المجلد موجود بالفعل');
    return;
  }

  tempPaths.push(path);
  input.value = '';

  renderPaths(tempPaths, document.getElementById('pathsList'), vaultId);
}

function removePathFromVault(vaultId, index) {
  const vault = vaultsList.find(v => v.id === vaultId);
  tempPaths = vault.root_paths ? JSON.parse(vault.root_paths) : [];
  tempPaths.splice(index, 1);

  renderPaths(tempPaths, document.getElementById('pathsList'), vaultId);
}

async function savePaths(vaultId) {
  try {
    const vault = vaultsList.find(v => v.id === vaultId);
    if (!vault) return;

    // تحديث الـ API
    await fetch(`/api/admin/vaults/${vaultId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: vault.name,
        url: vault.url,
        api_key: vault.api_key,
        root_paths: tempPaths
      })
    });

    alert('✅ تم حفظ المجلدات بنجاح');
    closePathsModal();
    loadVaults();
  } catch (e) {
    alert('❌ خطأ: ' + e.message);
  }
}

function closePathsModal() {
  const modal = document.getElementById('pathsModal');
  if (modal) modal.remove();
  tempPaths = [];
}

// ========== دالة مسح تلقائي محسّنة ==========
async function startScan() {
  const btn = document.getElementById('scanBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> جاري المسح...';

  const alert = document.getElementById('scanAlert');
  alert.classList.remove('show');

  try {
    const res = await api('/admin/kvault/auto-scan', { method: 'POST' });

    if (!res.success) throw new Error('فشل المسح');

    const report = res.report || [];
    const totalNew = res.total_new || 0;

    let logText = `✅ تم إكمال المسح\n`;
    logText += `📊 إجمالي الفصول الجديدة: ${totalNew}\n\n`;

    report.forEach(item => {
      if (item.error) {
        logText += `❌ ${item.vault}: ${item.error}\n`;
      } else {
        logText += `✅ ${item.vault} > ${item.manga} (${item.path})\n`;
        logText += `   📑 ${item.new_chapters} فصول جديدة\n`;
      }
    });

    document.getElementById('scanLog').textContent = logText;
    document.getElementById('scanLogCard').style.display = 'block';

    showAlert(alert, `✅ تم المسح بنجاح! اكتُشفت ${totalNew} فصول جديدة`, 'success');
  } catch (e) {
    showAlert(alert, '❌ خطأ في المسح: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔄 بدء المسح الآن';
  }
}

// ========== دالة استيراد مانجا محسّنة ==========
async function importMangaFull() {
  const vaultId = document.getElementById('impMVault').value;
  const folder = document.getElementById('impMFolder').value;
  const title = document.getElementById('impMTitle').value.trim();

  if (!vaultId || !folder) {
    showAlert(document.getElementById('importMangaAlert'), 'اختر Vault ومجلد المانجا', 'error');
    return;
  }

  const alert = document.getElementById('importMangaAlert');
  alert.classList.remove('show');
  
  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> جاري الاستيراد...';

  try {
    const res = await api('/admin/kvault/import-manga', {
      method: 'POST',
      body: JSON.stringify({
        vault_id: parseInt(vaultId),
        manga_path: folder,
        manga_title: title
      })
    });

    if (!res.success) throw new Error('فشل الاستيراد');

    let logText = `✅ تم استيراد المانجا بنجاح!\n\n`;
    logText += `📚 المانجا: ${res.manga_info?.title || folder}\n`;
    logText += `🆔 المعرف: ${res.slug}\n`;
    logText += `📑 عدد الفصول: ${res.chapters_imported}\n\n`;

    logText += `📋 التفاصيل:\n`;
    (res.chapters || []).forEach(ch => {
      logText += `✓ الفصل ${ch.chapter}: ${ch.images} صور\n`;
    });

    document.getElementById('importLog').textContent = logText;
    document.getElementById('importMangaLog').style.display = 'block';

    showAlert(alert, `✅ تم استيراد ${res.chapters_imported} فصول بنجاح!`, 'success');
  } catch (e) {
    showAlert(alert, '❌ خطأ: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🚀 استيراد مع جلب المعلومات';
  }
}

// ========== تحميل قائمة المجلدات ==========
async function loadMangaFoldersList() {
  const vaultId = document.getElementById('impMVault').value;
  if (!vaultId) return;

  try {
    const res = await api('/admin/kvault/folders', {
      method: 'POST',
      body: JSON.stringify({ vault_id: parseInt(vaultId) })
    });

    const select = document.getElementById('impMFolder');
    select.innerHTML = '<option value="">-- اختر مانجا --</option>' +
      (res.folders || []).map(f => `<option value="${f}">${f}</option>`).join('');
  } catch (e) {
    console.error('خطأ:', e);
  }
}
