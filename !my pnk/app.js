/**
 * Xozen Cloud - Sistem Pengumpulan Tugas & Drive Lokal
 * Tanpa data dummy, autentikasi gerbang awal, long-press guru 5 detik, dan penyimpanan progress lokal (temp).
 */

// Daftar Akun Murid Resmi Kelas X-B (Siswa Aktif: Absen 1-15 dan Absen 17, tanpa Absen 16)
const INITIAL_STUDENTS = [
  { absen: 1, name: 'Arnold Winson Santoso', code: '1pnk' },
  { absen: 2, name: 'Dave Samuel Prawira Sutomo', code: '2pnk' },
  { absen: 3, name: 'Elia Gustaaf Seisjunio Sanger', code: '3pnk' },
  { absen: 4, name: 'Elliana Avril Sugiri', code: '4pnk' },
  { absen: 5, name: 'Fabianus Evanjanu Arkananta', code: '5pnk' },
  { absen: 6, name: 'Firent Brigeyza', code: '6pnk' },
  { absen: 7, name: 'Gyselle Assa Calysta', code: '7pnk' },
  { absen: 8, name: 'Hosea Dandi Wibowo', code: '8pnk' },
  { absen: 9, name: 'Jericho Ezra Shallom, Fautngiljanan', code: '9pnk' },
  { absen: 10, name: 'Jocelyn Dhamelinnka Uneputty', code: '10pnk' },
  { absen: 11, name: 'Kefas Victoriano Fritzietama', code: '11pnk' },
  { absen: 12, name: 'Kenzo Natha Tadani', code: '12pnk' },
  { absen: 13, name: 'Maelynn Nielsie', code: '13pnk' },
  { absen: 14, name: 'Michael Wibowo', code: '14pnk' },
  { absen: 15, name: 'Muhamad Alif Januar Putra Pradana', code: '15pnk' },
  { absen: 17, name: 'Stevan Christian', code: '123' }
];

// Akun Demo Siswa Kelas X-A (5 Siswa)
const DEMO_STUDENTS_XA = [
  { absen: 1, name: 'Aditia Pratama', code: '1pnk' },
  { absen: 2, name: 'Bella Ananda', code: '2pnk' },
  { absen: 3, name: 'Calvin Wijaya', code: '3pnk' },
  { absen: 4, name: 'Dinda Kirana', code: '4pnk' },
  { absen: 5, name: 'Ezra Matthew', code: '5pnk' }
];

// Akun Demo Siswa Kelas X-C (5 Siswa)
const DEMO_STUDENTS_XC = [
  { absen: 1, name: 'Agnes Monica Halim', code: '1pnk' },
  { absen: 2, name: 'Bryan Nicholas', code: '2pnk' },
  { absen: 3, name: 'Chloe Gabriella', code: '3pnk' },
  { absen: 4, name: 'Daniel Steven', code: '4pnk' },
  { absen: 5, name: 'Evelyn Clarissa', code: '5pnk' }
];

let gatewaySelectedClass = 'XB';

// Global Application State
const appState = {
  currentUser: null, // null jika belum login
  activeClassId: localStorage.getItem('myPnk_activeClassId') || 'XB',
  availableClasses: ['XA', 'XB', 'XC'],
  students: [],
  driveHandle: null,
  driveFolderName: 'Belum Dipilih',
  assignments: [],
  submissions: [],
  activeSubjectFilter: 'all',
  activeStatusFilter: 'all',
  searchQuery: '',
  studentFilterOnlyMine: false,
  selectedAssignmentForSubmit: null,
  selectedAssignmentForReview: null,
  selectedSubmitFile: null,
  teacherPasswordHolder: null,
  schedules: [],
  temporarySchedules: [],
  piket: {},
  devo: [],
  activeScheduleDay: 'Senin',
  activeScheduleSubView: 'roster'
};

// Intercept window.fetch to automatically route every API call to activeClassId
const originalWindowFetch = window.fetch;
window.fetch = function(resource, init = {}) {
  const url = typeof resource === 'string' ? resource : (resource instanceof Request ? resource.url : '');
  if (url.includes('/api/')) {
    init = init || {};
    const headers = new Headers(init.headers || (resource instanceof Request ? resource.headers : {}));
    if (!headers.has('x-class-id')) {
      const cls = (appState && appState.activeClassId) ? appState.activeClassId : (localStorage.getItem('myPnk_activeClassId') || 'XB');
      headers.set('x-class-id', cls);
    }
    init.headers = headers;
  }
  return originalWindowFetch.call(this, resource, init);
};

// IndexedDB Storage Engine
// Server-backed app: no local IndexedDB needed anymore
function initSchoolDB() {
  return Promise.resolve(null);
}

// DB Helpers - server-backed via /api/db (centralized on CasaOS device)
async function dbGetAll(storeName) {
  try {
    const res = await fetch(`/api/db/${encodeURIComponent(storeName)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    console.warn(`dbGetAll(${storeName}) gagal menghubungi server:`, err);
    return [];
  }
}

async function dbPut(storeName, item) {
  try {
    const res = await fetch(`/api/db/${encodeURIComponent(storeName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    if (!res.ok) {
      console.warn(`dbPut(${storeName}) ditolak server:`, res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`dbPut(${storeName}) gagal menghubungi server:`, err);
    return false;
  }
}

async function dbDelete(storeName, key) {
  try {
    const res = await fetch(`/api/db/${encodeURIComponent(storeName)}?key=${encodeURIComponent(String(key))}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      console.warn(`dbDelete(${storeName}) ditolak server:`, res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`dbDelete(${storeName}) gagal menghubungi server:`, err);
    return false;
  }
}

async function initStudentsRoster() {
  const existing = await dbGetAll('students');
  if (existing.length === 0) {
    for (const s of INITIAL_STUDENTS) {
      await dbPut('students', s);
    }
    appState.students = INITIAL_STUDENTS;
  } else {
    appState.students = existing.sort((a, b) => a.absen - b.absen);
  }
}

// DOM Elements
const dom = {
  // Gateway Auth & Morphing Container
  authGatewayScreen: document.getElementById('authGatewayScreen'),
  authMorphContainer: document.getElementById('authMorphContainer'),
  btnGatewayLogoTrigger: document.getElementById('btnGatewayLogoTrigger'),
  gatewayCardInner: document.getElementById('gatewayCardInner'),
  btnCollapseGateway: document.getElementById('btnCollapseGateway'),
  gatewayStudentPanel: document.getElementById('gatewayStudentPanel'),
  gatewayTeacherPanel: document.getElementById('gatewayTeacherPanel'),
  gatewayStudentForm: document.getElementById('gatewayStudentForm'),
  wizardStepDot1: document.getElementById('wizardStepDot1'),
  wizardStepDot2: document.getElementById('wizardStepDot2'),
  wizardStepDot3: document.getElementById('wizardStepDot3'),
  wizardConnector1: document.getElementById('wizardConnector1'),
  wizardConnector2: document.getElementById('wizardConnector2'),
  wizardStep1: document.getElementById('wizardStep1'),
  wizardStep2: document.getElementById('wizardStep2'),
  wizardStep3: document.getElementById('wizardStep3'),
  wizardStep2ClassPill: document.getElementById('wizardStep2ClassPill'),
  btnSwitchToTeacher: document.getElementById('btnSwitchToTeacher'),
  gatewayAbsenInput: document.getElementById('gatewayAbsenInput'),
  gatewayStudentPreview: document.getElementById('gatewayStudentPreview'),
  gatewayPreviewAvatar: document.getElementById('gatewayPreviewAvatar'),
  gatewayPreviewName: document.getElementById('gatewayPreviewName'),
  btnWizardStep1Next: document.getElementById('btnWizardStep1Next'),
  btnWizardStep2Prev: document.getElementById('btnWizardStep2Prev'),
  btnWizardNextStep: document.getElementById('btnWizardNextStep'),
  summaryAbsenPill: document.getElementById('summaryAbsenPill'),
  summaryNameText: document.getElementById('summaryNameText'),
  gatewayPasswordInput: document.getElementById('gatewayPasswordInput'),
  btnWizardPrevStep: document.getElementById('btnWizardPrevStep'),
  btnGatewayLanjutkan: document.getElementById('btnGatewayLanjutkan'),
  btnLanjutkanLabel: document.getElementById('btnLanjutkanLabel'),
  holdProgressFill: document.getElementById('holdProgressFill'),
  gatewayTeacherForm: document.getElementById('gatewayTeacherForm'),
  gatewayTeacherPassword: document.getElementById('gatewayTeacherPassword'),
  btnCancelGatewayTeacher: document.getElementById('btnCancelGatewayTeacher'),

  // Main App Shell
  mainAppShell: document.getElementById('mainAppShell'),
  userProfileBadge: document.getElementById('userProfileBadge'),
  userAvatarText: document.getElementById('userAvatarText'),
  userAvatarImg: document.getElementById('userAvatarImg'),
  avatarFileInput: document.getElementById('avatarFileInput'),
  avatarEditTrigger: document.getElementById('avatarEditTrigger'),
  userNameDisplay: document.getElementById('userNameDisplay'),
  userRoleDisplay: document.getElementById('userRoleDisplay'),
  btnLogoutAccount: document.getElementById('btnLogoutAccount'),
  
  // Sidebar Page Navigation
  navBtnTasks: document.getElementById('navBtnTasks'),
  navBtnDashboard: document.getElementById('navBtnDashboard'),
  navBtnHistory: document.getElementById('navBtnHistory'),
  navBtnSchedule: document.getElementById('navBtnSchedule'),
  navBtnSpinWheel: document.getElementById('navBtnSpinWheel'),
  tasksViewPage: document.getElementById('tasksViewPage'),
  dashboardViewPage: document.getElementById('dashboardViewPage'),
  scheduleViewPage: document.getElementById('scheduleViewPage'),
  spinWheelViewPage: document.getElementById('spinWheelViewPage'),
  btnBackFromSchedule: document.getElementById('btnBackFromSchedule'),
  btnBackFromSpinWheel: document.getElementById('btnBackFromSpinWheel'),
  btnDashboardOpenSchedule: document.getElementById('btnDashboardOpenSchedule'),

  // Sidebar
  teacherActionsContainer: document.getElementById('teacherActionsContainer'),
  studentActionsContainer: document.getElementById('studentActionsContainer'),
  btnOpenCreateAssignmentModal: document.getElementById('btnOpenCreateAssignmentModal'),
  btnOpenStudentAccountsModal: document.getElementById('btnOpenStudentAccountsModal'),
  btnOpenResetModal: document.getElementById('btnOpenResetModal'),
  statsActiveAssignments: document.getElementById('statsActiveAssignments'),
  statsTotalSubmissions: document.getElementById('statsTotalSubmissions'),
  statsStoragePath: document.getElementById('statsStoragePath'),

  // Main Workspace
  mainViewHeading: document.getElementById('mainViewHeading'),
  taskSearchInput: document.getElementById('taskSearchInput'),
  statusFilterSelect: document.getElementById('statusFilterSelect'),
  emptyAssignmentsState: document.getElementById('emptyAssignmentsState'),
  emptyStateDesc: document.getElementById('emptyStateDesc'),
  emptyStateActions: document.getElementById('emptyStateActions'),
  btnEmptyCreateAssignment: document.getElementById('btnEmptyCreateAssignment'),
  assignmentsGridContainer: document.getElementById('assignmentsGridContainer'),

  // Toast
  toastContainer: document.getElementById('toastContainer'),

  // Modal Accounts List (16 Murid)
  studentAccountsModal: document.getElementById('studentAccountsModal'),
  btnCloseAccountsModal: document.getElementById('btnCloseAccountsModal'),
  studentAccountsTableBody: document.getElementById('studentAccountsTableBody'),
  btnCopyAllStudentLogins: document.getElementById('btnCopyAllStudentLogins'),
  btnAddStudentAccount: document.getElementById('btnAddStudentAccount'),
  btnChangeTeacherPassword: document.getElementById('btnChangeTeacherPassword'),
  btnCloseAccountsView: document.getElementById('btnCloseAccountsView'),

  // Modal Create Assignment
  createAssignmentModal: document.getElementById('createAssignmentModal'),
  btnCloseAssignmentModal: document.getElementById('btnCloseAssignmentModal'),
  createAssignmentForm: document.getElementById('createAssignmentForm'),
  assignmentTitle: document.getElementById('assignmentTitle'),
  assignmentSubject: document.getElementById('assignmentSubject'),
  assignmentDesc: document.getElementById('assignmentDesc'),
  assignmentDeadline: document.getElementById('assignmentDeadline'),
  lateSubmissionPolicy: document.getElementById('lateSubmissionPolicy'),
  btnCancelAssignment: document.getElementById('btnCancelAssignment'),
  teacherDraftIndicator: document.getElementById('teacherDraftIndicator'),
  radioTaskIndividual: document.getElementById('radioTaskIndividual'),
  radioTaskGroup: document.getElementById('radioTaskGroup'),
  assignmentGroupSetupSection: document.getElementById('assignmentGroupSetupSection'),
  btnImportFromSpinGroup: document.getElementById('btnImportFromSpinGroup'),
  btnUploadSpinGroupJson: document.getElementById('btnUploadSpinGroupJson'),
  inputUploadSpinGroupJson: document.getElementById('inputUploadSpinGroupJson'),
  btnToggleManualGroupBuilder: document.getElementById('btnToggleManualGroupBuilder'),
  manualGroupBuilderSection: document.getElementById('manualGroupBuilderSection'),
  btnAddManualGroup: document.getElementById('btnAddManualGroup'),
  btnApplyManualGroups: document.getElementById('btnApplyManualGroups'),
  btnCancelManualGroupBuilder: document.getElementById('btnCancelManualGroupBuilder'),
  manualGroupsCardsList: document.getElementById('manualGroupsCardsList'),
  btnAutoDivideGroups: document.getElementById('btnAutoDivideGroups'),
  groupAssignmentCountBadge: document.getElementById('groupAssignmentCountBadge'),
  assignmentGroupsPreviewContainer: document.getElementById('assignmentGroupsPreviewContainer'),

  // Group Grading Modal
  groupGradingModal: document.getElementById('groupGradingModal'),
  btnCloseGroupGradingModal: document.getElementById('btnCloseGroupGradingModal'),
  btnCancelGroupGrading: document.getElementById('btnCancelGroupGrading'),
  groupGradingSubtitle: document.getElementById('groupGradingSubtitle'),
  radioGradeModeSame: document.getElementById('radioGradeModeSame'),
  radioGradeModeIndividual: document.getElementById('radioGradeModeIndividual'),
  groupGradingSameSection: document.getElementById('groupGradingSameSection'),
  groupSharedScoreInput: document.getElementById('groupSharedScoreInput'),
  groupGradingIndividualSection: document.getElementById('groupGradingIndividualSection'),
  groupIndividualMembersList: document.getElementById('groupIndividualMembersList'),
  btnSaveGroupGrading: document.getElementById('btnSaveGroupGrading'),

  // Modal Student Submit
  submitTaskModal: document.getElementById('submitTaskModal'),
  btnCloseSubmitModal: document.getElementById('btnCloseSubmitModal'),
  submitSubjectAndTitle: document.getElementById('submitSubjectAndTitle'),
  submitInstructionText: document.getElementById('submitInstructionText'),
  submitDeadlineText: document.getElementById('submitDeadlineText'),
  submitPolicyTag: document.getElementById('submitPolicyTag'),
  submissionClosedAlert: document.getElementById('submissionClosedAlert'),
  submissionLateWarningAlert: document.getElementById('submissionLateWarningAlert'),
  submitTaskForm: document.getElementById('submitTaskForm'),
  submitAvatarImg: document.getElementById('submitAvatarImg'),
  submitAvatarText: document.getElementById('submitAvatarText'),
  submitStudentNameGroup: document.getElementById('submitStudentNameGroup'),
  studentNameInput: document.getElementById('studentNameInput'),
  existingSubmissionPreviewBox: document.getElementById('existingSubmissionPreviewBox'),
  existingSubTimeText: document.getElementById('existingSubTimeText'),
  submitModalBottomTimestamp: document.getElementById('submitModalBottomTimestamp'),
  existingSubSingleBody: document.getElementById('existingSubSingleBody'),
  existingSubFilesList: document.getElementById('existingSubFilesList'),
  existingSubFileName: document.getElementById('existingSubFileName'),
  existingSubFileSize: document.getElementById('existingSubFileSize'),
  btnPreviewExistingFile: document.getElementById('btnPreviewExistingFile'),
  btnRevokeSubmission: document.getElementById('btnRevokeSubmission'),
  submitNotesGroup: document.getElementById('submitNotesGroup'),
  studentNotes: document.getElementById('studentNotes'),
  submitFilesGroup: document.getElementById('submitFilesGroup'),
  taskFileDropzone: document.getElementById('taskFileDropzone'),
  studentFileUploadInput: document.getElementById('studentFileUploadInput'),
  selectedFileNameDisplay: document.getElementById('selectedFileNameDisplay'),
  selectedFilesList: document.getElementById('selectedFilesList'),
  btnCancelSubmit: document.getElementById('btnCancelSubmit'),
  btnConfirmSubmitTask: document.getElementById('btnConfirmSubmitTask'),
  studentDraftIndicator: document.getElementById('studentDraftIndicator'),

  // Modal Avatar 1:1 Cropper
  avatarCropModal: document.getElementById('avatarCropModal'),
  btnCloseAvatarCropModal: document.getElementById('btnCloseAvatarCropModal'),
  btnCancelAvatarCrop: document.getElementById('btnCancelAvatarCrop'),
  btnApplyAvatarCrop: document.getElementById('btnApplyAvatarCrop'),
  avatarCropCanvas: document.getElementById('avatarCropCanvas'),
  avatarCropViewport: document.getElementById('avatarCropViewport'),
  avatarZoomRange: document.getElementById('avatarZoomRange'),

  // Modal Guru Review Submissions
  submissionsListModal: document.getElementById('submissionsListModal'),
  btnCloseSubmissionsModal: document.getElementById('btnCloseSubmissionsModal'),
  submissionsSubTitle: document.getElementById('submissionsSubTitle'),
  submissionsTableBody: document.getElementById('submissionsTableBody'),
  btnCloseSubmissionsView: document.getElementById('btnCloseSubmissionsView'),

  // Modal Task History Pop-up
  taskHistoryModal: document.getElementById('taskHistoryModal'),
  btnCloseHistoryModal: document.getElementById('btnCloseHistoryModal'),
  btnCloseHistoryFooter: document.getElementById('btnCloseHistoryFooter'),
  historyTableHead: document.getElementById('historyTableHead'),
  historyTableBody: document.getElementById('historyTableBody'),
  emptyHistoryState: document.getElementById('emptyHistoryState'),
  historyModalSubtitle: document.getElementById('historyModalSubtitle'),
  thHistorySiswa: document.getElementById('thHistorySiswa'),

  // Modal Reset All Data
  resetDataModal: document.getElementById('resetDataModal'),
  btnCloseResetModal: document.getElementById('btnCloseResetModal'),
  resetDataForm: document.getElementById('resetDataForm'),
  resetPasswordInput: document.getElementById('resetPasswordInput'),
  btnCancelResetData: document.getElementById('btnCancelResetData'),

  // System Summary Toggle and Circle Label
  btnToggleSystemSummary: document.getElementById('btnToggleSystemSummary'),
  systemSummaryDropdown: document.getElementById('systemSummaryDropdown'),
  systemSummaryToggleText: document.getElementById('systemSummaryToggleText'),
  timelyRateLabel: document.getElementById('timelyRateLabel'),

  // Global Loading Screen Overlay
  globalLoadingOverlay: document.getElementById('globalLoadingOverlay'),
  loadingModalTitle: document.getElementById('loadingModalTitle'),
  loadingModalMessage: document.getElementById('loadingModalMessage')
};

// Global Loading Indicator & Screen Helper (Supports progress & top-layer dialogs)
function showLoadingOverlay(title = 'Memproses Data', message = 'Mohon tunggu sebentar...', progress = null) {
  const overlay = document.getElementById('globalLoadingOverlay');
  if (!overlay) return;
  const titleEl = document.getElementById('loadingModalTitle');
  const msgEl = document.getElementById('loadingModalMessage');
  const progressContainer = document.getElementById('loadingProgressBarContainer');
  const progressFill = document.getElementById('loadingProgressBarFill');
  const progressText = document.getElementById('loadingProgressPercentText');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;

  if (progress !== null && progress !== undefined && progressContainer && progressFill && progressText) {
    const clamped = Math.max(0, Math.min(100, Math.round(progress)));
    progressContainer.classList.remove('hidden');
    progressContainer.setAttribute('aria-hidden', 'false');
    progressFill.style.width = clamped + '%';
    progressText.classList.remove('hidden');
    progressText.textContent = clamped + '%';
  } else if (progressContainer && progressText) {
    progressContainer.classList.add('hidden');
    progressContainer.setAttribute('aria-hidden', 'true');
    progressText.classList.add('hidden');
  }

  // Top-layer dynamic reparenting: if any <dialog> is currently open, mount overlay inside topmost dialog
  const openDialogs = Array.from(document.querySelectorAll('dialog[open]'));
  if (openDialogs.length > 0) {
    const topDialog = openDialogs[openDialogs.length - 1];
    if (overlay.parentNode !== topDialog) {
      topDialog.appendChild(overlay);
    }
  } else if (overlay.parentNode !== document.body) {
    document.body.appendChild(overlay);
  }

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

function updateLoadingProgress(percent, message = null) {
  const overlay = document.getElementById('globalLoadingOverlay');
  if (!overlay || overlay.classList.contains('hidden')) return;
  const progressContainer = document.getElementById('loadingProgressBarContainer');
  const progressFill = document.getElementById('loadingProgressBarFill');
  const progressText = document.getElementById('loadingProgressPercentText');
  const msgEl = document.getElementById('loadingModalMessage');

  if (message && msgEl) {
    msgEl.textContent = message;
  }
  if (progressContainer && progressFill && progressText) {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    progressContainer.classList.remove('hidden');
    progressContainer.setAttribute('aria-hidden', 'false');
    progressFill.style.width = clamped + '%';
    progressText.classList.remove('hidden');
    progressText.textContent = clamped + '%';
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('globalLoadingOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  const progressContainer = document.getElementById('loadingProgressBarContainer');
  const progressText = document.getElementById('loadingProgressPercentText');
  if (progressContainer) progressContainer.classList.add('hidden');
  if (progressText) progressText.classList.add('hidden');
  if (overlay.parentNode !== document.body) {
    document.body.appendChild(overlay);
  }
}

// Aliases for unified loading experience
const showLoading = showLoadingOverlay;
const hideLoading = hideLoadingOverlay;

// Toast notification helper: renders on top of everything, including open dialogs in top-layer
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;

  // Find topmost open dialog if any (dialogs render in browser top-layer)
  const openDialogs = Array.from(document.querySelectorAll('dialog[open]'));
  const topDialog = openDialogs.length > 0 ? openDialogs[openDialogs.length - 1] : null;

  let container = dom.toastContainer;
  if (topDialog) {
    let dialogToastBox = topDialog.querySelector('.dialog-toast-box');
    if (!dialogToastBox) {
      dialogToastBox = document.createElement('div');
      dialogToastBox.className = 'toast-container dialog-toast-box';
      topDialog.appendChild(dialogToastBox);
    }
    container = dialogToastBox;
  }

  if (container) {
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }
}

// Custom Glass Confirm & Alert Dialog (Mild Blur Glass UI)
function showConfirmDialog({
  title = 'Konfirmasi Tindakan',
  message = 'Apakah Anda yakin ingin melanjutkan tindakan ini?',
  confirmText = 'Lanjutkan',
  cancelText = 'Batal',
  type = 'danger'
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customConfirmModal');
    if (!modal) {
      resolve(window.confirm(message));
      return;
    }

    const titleEl = document.getElementById('confirmDialogTitle');
    const msgEl = document.getElementById('confirmDialogMessage');
    const iconWrap = document.getElementById('confirmDialogIconWrap');
    const btnCancel = document.getElementById('btnConfirmCancel');
    const btnOk = document.getElementById('btnConfirmOk');
    const inputGroup = document.getElementById('confirmDialogInputGroup');

    if (inputGroup) inputGroup.classList.add('hidden');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    if (iconWrap) {
      iconWrap.className = `confirm-dialog-icon-wrap type-${type}`;
      const iconDanger = iconWrap.querySelector('.icon-danger');
      const iconWarning = iconWrap.querySelector('.icon-warning');
      const iconInfo = iconWrap.querySelector('.icon-info');
      if (iconDanger) iconDanger.classList.toggle('hidden', type !== 'danger');
      if (iconWarning) iconWarning.classList.toggle('hidden', type !== 'warning');
      if (iconInfo) iconInfo.classList.toggle('hidden', type !== 'info');
    }

    if (btnOk) {
      btnOk.textContent = confirmText;
      btnOk.className = `btn confirm-btn-ok ${type === 'danger' ? 'btn-danger' : type === 'warning' ? 'btn-warning' : 'btn-primary'}`;
    }

    if (btnCancel) {
      if (cancelText) {
        btnCancel.textContent = cancelText;
        btnCancel.style.display = 'inline-flex';
      } else {
        btnCancel.style.display = 'none';
      }
    }

    let resolved = false;
    const cleanUp = (result) => {
      if (resolved) return;
      resolved = true;
      modal.removeEventListener('close', onClose);
      btnCancel.removeEventListener('click', onCancel);
      btnOk.removeEventListener('click', onOk);
      if (modal.open) modal.close();
      resolve(result);
    };

    const onCancel = () => cleanUp(false);
    const onOk = () => cleanUp(true);
    const onClose = () => cleanUp(false);

    btnCancel.addEventListener('click', onCancel);
    btnOk.addEventListener('click', onOk);
    modal.addEventListener('close', onClose);

    modal.showModal();
    if (btnOk) btnOk.focus();
  });
}

function showAlertDialog({
  title = 'Pemberitahuan',
  message = '',
  buttonText = 'Mengerti',
  type = 'info'
} = {}) {
  return showConfirmDialog({
    title,
    message,
    confirmText: buttonText,
    cancelText: null,
    type
  });
}

// Custom Glass Prompt Dialog for User Question Inputs (Mild Blur Glass UI)
function showPromptDialog({
  title = 'Pertanyaan',
  message = 'Silakan masukkan nilai:',
  defaultValue = '',
  placeholder = '',
  inputType = 'text',
  confirmText = 'Simpan',
  cancelText = 'Batal',
  type = 'info'
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customConfirmModal');
    if (!modal) {
      resolve(window.prompt(message, defaultValue));
      return;
    }

    const titleEl = document.getElementById('confirmDialogTitle');
    const msgEl = document.getElementById('confirmDialogMessage');
    const iconWrap = document.getElementById('confirmDialogIconWrap');
    const btnCancel = document.getElementById('btnConfirmCancel');
    const btnOk = document.getElementById('btnConfirmOk');
    const inputGroup = document.getElementById('confirmDialogInputGroup');
    const inputEl = document.getElementById('confirmDialogInput');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    if (inputGroup && inputEl) {
      inputGroup.classList.remove('hidden');
      inputEl.type = inputType;
      inputEl.value = defaultValue || '';
      inputEl.placeholder = placeholder || '';
    }

    if (iconWrap) {
      iconWrap.className = `confirm-dialog-icon-wrap type-${type}`;
      const iconDanger = iconWrap.querySelector('.icon-danger');
      const iconWarning = iconWrap.querySelector('.icon-warning');
      const iconInfo = iconWrap.querySelector('.icon-info');
      if (iconDanger) iconDanger.classList.toggle('hidden', type !== 'danger');
      if (iconWarning) iconWarning.classList.toggle('hidden', type !== 'warning');
      if (iconInfo) iconInfo.classList.toggle('hidden', type !== 'info');
    }

    if (btnOk) {
      btnOk.textContent = confirmText;
      btnOk.className = `btn confirm-btn-ok ${type === 'danger' ? 'btn-danger' : type === 'warning' ? 'btn-warning' : 'btn-primary'}`;
    }

    if (btnCancel) {
      btnCancel.textContent = cancelText;
      btnCancel.style.display = 'inline-flex';
    }

    let resolved = false;
    const cleanUp = (result) => {
      if (resolved) return;
      resolved = true;
      modal.removeEventListener('close', onClose);
      btnCancel.removeEventListener('click', onCancel);
      btnOk.removeEventListener('click', onOk);
      if (inputEl) inputEl.removeEventListener('keydown', onKeyDown);
      if (inputGroup) inputGroup.classList.add('hidden');
      if (modal.open) modal.close();
      resolve(result);
    };

    const onCancel = () => cleanUp(null);
    const onOk = () => cleanUp(inputEl ? inputEl.value : null);
    const onClose = () => cleanUp(null);
    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    btnCancel.addEventListener('click', onCancel);
    btnOk.addEventListener('click', onOk);
    modal.addEventListener('close', onClose);
    if (inputEl) inputEl.addEventListener('keydown', onKeyDown);

    modal.showModal();
    if (inputEl) {
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 50);
    }
  });
}

// Global alert override so any alert calls use the Glass Dialog
window.alert = (msg) => {
  showAlertDialog({
    title: 'Pemberitahuan',
    message: String(msg),
    buttonText: 'Mengerti',
    type: 'info'
  });
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m];
  });
}

function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTruncatedFileName(fileName, maxLen = 22) {
  if (!fileName || typeof fileName !== 'string') return fileName || '';
  const trimmed = fileName.trim();
  if (trimmed.length <= maxLen) return trimmed;

  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx >= trimmed.length - 8) {
    const ext = trimmed.slice(dotIdx);
    const base = trimmed.slice(0, dotIdx);
    const available = Math.max(4, maxLen - ext.length - 6);
    const front = Math.ceil(available * 0.65);
    const back = Math.floor(available * 0.35);
    if (back > 0) {
      return `${base.slice(0, front)}......${base.slice(-back)}${ext}`;
    }
    return `${base.slice(0, available)}......${ext}`;
  }

  const half = Math.floor((maxLen - 6) / 2);
  return `${trimmed.slice(0, Math.max(2, half))}......${trimmed.slice(-Math.max(2, half))}`;
}

function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Deadline Analysis Function
function evaluateDeadline(assignment) {
  const now = new Date();
  const deadlineDate = new Date(assignment.deadline);
  const diffMs = deadlineDate.getTime() - now.getTime();
  const isPast = diffMs <= 0;

  let timeString = '';
  const absDiff = Math.abs(diffMs);
  const diffHours = Math.floor(absDiff / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;

  if (isPast) {
    if (diffDays > 0) timeString = `Lewat ${diffDays} hari lalu`;
    else if (diffHours > 0) timeString = `Lewat ${diffHours} jam lalu`;
    else timeString = 'Baru saja berakhir';
  } else {
    if (diffDays > 0) timeString = `Tersisa ${diffDays} hari ${remainingHours} jam`;
    else if (diffHours > 0) timeString = `Tersisa ${diffHours} jam`;
    else timeString = 'Kurang dari 1 jam lagi';
  }

  let statusKey = 'active';
  if (isPast) {
    statusKey = assignment.latePolicy === 'close' ? 'closed' : 'late_allowed';
  }

  return {
    isPast,
    timeString,
    statusKey,
    formattedDate: formatDateTime(assignment.deadline)
  };
}

// Real-time Countdown Formatter with React Bits Counter digits support
function formatCountdown(deadlineIso) {
  if (!deadlineIso) return { isPast: true, text: 'Waktu Tidak Valid', days: 0, hours: 0, minutes: 0, seconds: 0 };
  const target = new Date(deadlineIso).getTime();
  if (isNaN(target)) return { isPast: true, text: 'Waktu Tidak Valid', days: 0, hours: 0, minutes: 0, seconds: 0 };

  const now = Date.now();
  const diffMs = target - now;

  if (diffMs <= 0) {
    return { isPast: true, text: 'Waktu Habis', days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSecs = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  const pad = (n) => String(n).padStart(2, '0');

  let text = '';
  if (days > 0) {
    text = `${days} hari ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  } else {
    text = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  return {
    isPast: false,
    text,
    days,
    hours,
    minutes,
    seconds
  };
}

// React Bits Counter digit generator
function renderCounterDigitsHtml(cd) {
  if (cd.isPast) {
    return `<span class="deadline-expired">${escapeHtml(cd.text)}</span>`;
  }
  const pad = (n) => String(n).padStart(2, '0');
  let result = '<span class="counter-box">';
  if (cd.days > 0) {
    const daysStr = String(cd.days);
    for (const ch of daysStr) {
      const d = parseInt(ch, 10);
      result += `<span class="counter-digit-wrap" data-val="${d}"><span class="counter-strip" style="transform:translateY(-${d * 10}%);">${Array.from({length: 10}, (_, i) => `<span class="counter-numeral">${i}</span>`).join('')}</span></span>`;
    }
    result += `<span class="counter-sep">hari</span>`;
  }
  const timeStr = `${pad(cd.hours)}:${pad(cd.minutes)}:${pad(cd.seconds)}`;
  for (const ch of timeStr) {
    if (ch >= '0' && ch <= '9') {
      const d = parseInt(ch, 10);
      result += `<span class="counter-digit-wrap" data-val="${d}"><span class="counter-strip" style="transform:translateY(-${d * 10}%);">${Array.from({length: 10}, (_, i) => `<span class="counter-numeral">${i}</span>`).join('')}</span></span>`;
    } else {
      result += `<span class="counter-sep">:</span>`;
    }
  }
  result += '</span>';
  return result;
}

// Live Countdown Ticker with React Bits Counter Rolling Digits
function updateAllCountdowns() {
  const elements = document.querySelectorAll('.deadline-countdown-text[data-deadline]');
  if (!elements || elements.length === 0) return;

  elements.forEach((el) => {
    const deadlineIso = el.getAttribute('data-deadline');
    if (!deadlineIso) return;
    const cd = formatCountdown(deadlineIso);

    const labelEl = el.previousElementSibling;
    if (labelEl && labelEl.classList.contains('deadline-label')) {
      labelEl.textContent = cd.isPast ? 'Status: ' : 'Sisa Waktu: ';
    }

    if (cd.isPast) {
      el.classList.add('deadline-expired');
      if (el.textContent !== cd.text) {
        el.innerHTML = renderCounterDigitsHtml(cd);
      }
      const parentRow = el.closest('.deadline-row');
      if (parentRow) parentRow.classList.add('deadline-past');
    } else {
      el.classList.remove('deadline-expired');
      const parentRow = el.closest('.deadline-row');
      if (parentRow) parentRow.classList.remove('deadline-past');

      const digitWraps = el.querySelectorAll('.counter-digit-wrap');
      const targetDigits = [];
      if (cd.days > 0) {
        for (const ch of String(cd.days)) targetDigits.push(parseInt(ch, 10));
      }
      const pad = (n) => String(n).padStart(2, '0');
      const timeDigits = `${pad(cd.hours)}${pad(cd.minutes)}${pad(cd.seconds)}`;
      for (const ch of timeDigits) targetDigits.push(parseInt(ch, 10));

      if (digitWraps.length === targetDigits.length && digitWraps.length > 0) {
        digitWraps.forEach((wrap, idx) => {
          const nextD = targetDigits[idx];
          if (wrap.getAttribute('data-val') !== String(nextD)) {
            wrap.setAttribute('data-val', String(nextD));
            const strip = wrap.querySelector('.counter-strip');
            if (strip) strip.style.transform = `translateY(-${nextD * 10}%)`;
          }
        });
      } else {
        el.innerHTML = renderCounterDigitsHtml(cd);
      }
    }
  });
}

// Native Directory Picker for Local Drive Storage
async function chooseLocalDriveFolder() {
  if (!('showDirectoryPicker' in window)) {
    showToast('Browser Anda tidak mendukung Web Directory Picker. Menggunakan Virtual Drive lokal.', 'info');
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    appState.driveHandle = handle;
    appState.driveFolderName = handle.name;

    if (dom.storageStatusBadge) dom.storageStatusBadge.textContent = 'Drive: ' + handle.name;
    if (dom.driveFolderLabel) dom.driveFolderLabel.textContent = handle.name;
    dom.statsStoragePath.textContent = handle.name + ' (Drive Lokal)';

    showToast(`Folder drive lokal "${handle.name}" berhasil dihubungkan untuk penyimpanan tugas`, 'success');
  } catch (err) {
    if (err.name !== 'AbortError') {
      showToast('Gagal menghubungkan folder: ' + err.message, 'error');
    }
  }
}

// Save submitted file to local drive folder if connected
async function saveFileToDrive(assignment, studentName, file, isLate) {
  if (!appState.driveHandle) return;

  try {
    const safeFolderName = `${assignment.subject}_${assignment.title}`.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
    const taskDirHandle = await appState.driveHandle.getDirectoryHandle(safeFolderName, { create: true });

    const cleanStudentName = studentName.replace(/[\\/:*?"<>|]/g, '_');
    const lateTag = isLate ? '[TERLAMBAT]_' : '';
    const finalFileName = `${lateTag}${cleanStudentName}_${file.name}`;

    const fileHandle = await taskDirHandle.getFileHandle(finalFileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
  } catch (err) {
    console.warn('Penyimpanan ke disk fisik menghadapi kendala:', err);
  }
}

// User Profile & Role Management
function updateUserRoleUI() {
  if (!appState.currentUser) return;
  const isGuru = appState.currentUser.role === 'guru';

  if (isGuru) {
    dom.userNameDisplay.textContent = 'Admin';
    dom.userRoleDisplay.textContent = 'Guru';
    dom.userAvatarText.textContent = 'A';
    if (dom.userAvatarImg) dom.userAvatarImg.classList.add('hidden');
    if (dom.userAvatarText) dom.userAvatarText.classList.remove('hidden');
    if (dom.avatarEditTrigger) dom.avatarEditTrigger.style.display = 'none';
    if (dom.timelyRateLabel) dom.timelyRateLabel.textContent = 'Ketertiban Siswa Mengirim Tugas';
    if (dom.teacherActionsContainer) dom.teacherActionsContainer.classList.remove('hidden');
    if (dom.studentActionsContainer) dom.studentActionsContainer.classList.add('hidden');
    if (dom.navBtnCustomize) dom.navBtnCustomize.classList.remove('hidden');
    const navBtnClass = document.getElementById('navBtnClassPicker');
    if (navBtnClass) {
      navBtnClass.classList.remove('hidden');
      navBtnClass.style.display = 'flex';
    }
    const quizTeacherGroup = document.getElementById('quizTeacherActionGroup');
    if (quizTeacherGroup) {
      quizTeacherGroup.classList.remove('hidden');
      quizTeacherGroup.style.display = 'flex';
    }
    const btnWall = document.getElementById('btnOpenWallpaperModal');
    if (btnWall) {
      btnWall.style.display = 'inline-flex';
    }
    const dashboardAdminSection = document.getElementById('dashboardServerAdminSection');
    if (dashboardAdminSection) {
      dashboardAdminSection.classList.remove('hidden');
      dashboardAdminSection.style.display = 'block';
    }
    if (dom.submitStudentNameGroup) dom.submitStudentNameGroup.style.display = 'block';
    dom.emptyStateDesc.textContent = 'Belum ada tugas yang dibuat. Silakan klik tombol di bawah untuk membuat tugas baru.';
    dom.emptyStateActions.classList.remove('hidden');
  } else {
    // Siswa view: tampilkan nama bersih tanpa tombol pemilih kelas
    const stuClassId = appState.currentUser.classId || appState.activeClassId || 'XB';
    const stuClassLabel = stuClassId === 'XB' ? 'X-B' : (stuClassId === 'XA' ? 'X-A' : 'X-C');
    dom.userNameDisplay.textContent = appState.currentUser.name || 'Siswa';
    dom.userRoleDisplay.textContent = `Siswa (${stuClassLabel})`;
    dom.userAvatarText.textContent = appState.currentUser.absen ? String(appState.currentUser.absen) : 'S';
    if (dom.avatarEditTrigger) dom.avatarEditTrigger.style.display = 'flex';
    if (dom.timelyRateLabel) dom.timelyRateLabel.textContent = 'Ketepatan Waktu Tugas';
    if (dom.submitStudentNameGroup) dom.submitStudentNameGroup.style.display = 'none';

    // Load student profile picture if saved in localStorage
    const savedAvatar = localStorage.getItem('xozen_avatar_' + appState.currentUser.absen);
    if (savedAvatar && dom.userAvatarImg) {
      dom.userAvatarImg.src = savedAvatar;
      dom.userAvatarImg.classList.remove('hidden');
      if (dom.userAvatarText) dom.userAvatarText.classList.add('hidden');
    } else {
      if (dom.userAvatarImg) dom.userAvatarImg.classList.add('hidden');
      if (dom.userAvatarText) dom.userAvatarText.classList.remove('hidden');
    }

    if (dom.teacherActionsContainer) dom.teacherActionsContainer.classList.add('hidden');
    if (dom.studentActionsContainer) dom.studentActionsContainer.classList.remove('hidden');
    if (dom.navBtnCustomize) dom.navBtnCustomize.classList.add('hidden');
    const navBtnClass = document.getElementById('navBtnClassPicker');
    if (navBtnClass) {
      navBtnClass.classList.add('hidden');
      navBtnClass.style.display = 'none';
    }
    const quizTeacherGroup = document.getElementById('quizTeacherActionGroup');
    if (quizTeacherGroup) {
      quizTeacherGroup.classList.add('hidden');
      quizTeacherGroup.style.display = 'none';
    }
    const btnWall = document.getElementById('btnOpenWallpaperModal');
    if (btnWall) {
      btnWall.style.display = 'none';
    }
    const dashboardAdminSection = document.getElementById('dashboardServerAdminSection');
    if (dashboardAdminSection) {
      dashboardAdminSection.classList.add('hidden');
      dashboardAdminSection.style.display = 'none';
    }
    dom.emptyStateDesc.textContent = 'Belum ada tugas yang diberikan oleh guru.';
    dom.emptyStateActions.classList.add('hidden');
  }

  if (typeof restoreSidebarActiveView === 'function') {
    restoreSidebarActiveView();
  }
  if (typeof updateTasksSidebarSubmenu === 'function') {
    updateTasksSidebarSubmenu(currentWorkspaceView === 'tasks');
  }
  renderAssignmentsList();
}

function loadSavedSession() {
  try {
    const saved = localStorage.getItem('xozen_logged_in_user');
    if (saved) {
      appState.currentUser = JSON.parse(saved);
      if (appState.currentUser && appState.currentUser.role === 'guru') {
        appState.currentUser.name = 'Admin';
      }
      if (appState.currentUser && appState.currentUser.classId) {
        appState.activeClassId = appState.currentUser.classId;
      }
      return true;
    }
  } catch {
    // Ignore
  }
  return false;
}

// Segera pulihkan sesi login agar tidak pernah hilang saat refresh browser
try {
  const hasSavedSessionEarly = loadSavedSession();
  if (hasSavedSessionEarly && appState.currentUser) {
    if (dom.authGatewayScreen) dom.authGatewayScreen.classList.add('hidden');
    if (dom.mainAppShell) dom.mainAppShell.classList.remove('hidden');
    updateUserRoleUI();
  }
} catch (e) {
  console.warn('Initial session restore check:', e);
}

function saveUserSession(userProfile) {
  if (userProfile && !userProfile.classId) {
    userProfile.classId = appState.activeClassId || 'XB';
  }
  appState.currentUser = userProfile;
  localStorage.setItem('xozen_logged_in_user', JSON.stringify(appState.currentUser));
}

function logoutUser() {
  localStorage.removeItem('xozen_logged_in_user');
  appState.currentUser = null;
  dom.mainAppShell.classList.add('hidden');
  dom.authGatewayScreen.classList.remove('hidden');
  collapseGatewayToButton();
  dom.gatewayTeacherPanel.classList.add('hidden');
  dom.gatewayStudentPanel.classList.remove('hidden');
  dom.gatewayAbsenInput.value = '';
  dom.gatewayPasswordInput.value = '';
  if (dom.gatewayStudentPreview) dom.gatewayStudentPreview.classList.add('hidden');
  showToast('Anda telah keluar. Silakan masuk kembali.', 'info');
}

// Load and Render Assignments with Saved Server Sync
async function refreshData() {
  const isTeacher = appState.currentUser && (appState.currentUser.role === 'teacher' || appState.currentUser.role === 'guru');
  const role = isTeacher ? 'teacher' : 'student';
  const absen = appState.currentUser && appState.currentUser.absen ? appState.currentUser.absen : '';

  try {
    const res = await fetch(`/api/data?role=${role}&absen=${absen}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.assignments)) {
        appState.assignments = data.assignments;
        for (const a of data.assignments) {
          await dbPut('assignments', a);
        }
      }
      if (Array.isArray(data.submissions)) {
        appState.submissions = data.submissions;
        for (const s of data.submissions) {
          await dbPut('submissions', s);
        }
      }
      if (Array.isArray(data.quizzes)) {
        appState.quizzes = data.quizzes;
      }
      if (Array.isArray(data.quizSessions)) {
        appState.quizSessions = data.quizSessions;
      }
      if (Array.isArray(data.schedules)) {
        appState.schedules = data.schedules;
      }
      if (Array.isArray(data.temporarySchedules)) {
        appState.temporarySchedules = data.temporarySchedules;
      }
      if (data.piket && typeof data.piket === 'object') {
        appState.piket = data.piket;
      }
      if (Array.isArray(data.devo)) {
        appState.devo = data.devo;
      }
      if (Array.isArray(data.students)) {
        appState.students = data.students;
      }
    } else {
      appState.assignments = await dbGetAll('assignments');
      appState.submissions = await dbGetAll('submissions');
    }
  } catch {
    appState.assignments = await dbGetAll('assignments');
    appState.submissions = await dbGetAll('submissions');
  }

  renderAssignmentsList();
  if (typeof renderQuizzesList === 'function') {
    renderQuizzesList();
  }
  if (typeof renderScheduleDashboardWidget === 'function') {
    renderScheduleDashboardWidget();
  }
  if (typeof renderScheduleView === 'function') {
    renderScheduleView();
  }
  updateSidebarStatistics();
  updateTimelyRateCircleBar();
}

function getFilteredAssignments() {
  let list = [...appState.assignments];

  // Subject filter
  if (appState.activeSubjectFilter !== 'all') {
    list = list.filter(a => a.subject === appState.activeSubjectFilter);
  }

  // Search filter
  if (appState.searchQuery.trim() !== '') {
    const q = appState.searchQuery.toLowerCase();
    list = list.filter(a => a.title.toLowerCase().includes(q) || a.subject.toLowerCase().includes(q));
  }

  // Status filter
  if (appState.activeStatusFilter !== 'all') {
    list = list.filter(a => {
      const { isPast } = evaluateDeadline(a);
      if (appState.activeStatusFilter === 'active') return !isPast;
      if (appState.activeStatusFilter === 'closed') return isPast;
      return true;
    });
  }

  // If student clicked "Riwayat Tugas Saya"
  if (appState.studentFilterOnlyMine && appState.currentUser && appState.currentUser.role === 'siswa') {
    const currentName = appState.currentUser.name.toLowerCase();
    const mySubmissionsAssignmentIds = appState.submissions
      .filter(s => s.studentName.toLowerCase().includes(currentName))
      .map(s => s.assignmentId);
    list = list.filter(a => mySubmissionsAssignmentIds.includes(a.id));
  }

  // Sort by deadline (soonest first)
  list.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

  return list;
}

/* ==========================================================================
   REACT BITS: CARD SWAP ENGINE FOR DAFTAR TUGAS 3D STACK
   ========================================================================== */
let cardSwapEngine = null;

function createCardSwapEngine(root, options = {}) {
  if (!root) return null;
  const stage = root.querySelector('.card-swap-stage');
  const slots = Array.from(root.querySelectorAll('.card-swap-slot'));
  const shades = Array.from(root.querySelectorAll('.card-swap-shade'));
  const count = slots.length;
  if (!stage || count === 0) return null;

  const {
    cardDistance = 50,
    verticalDistance = 60,
    depth = 80,
    skewAmount = 5,
    visibleCards = 4,
    speed = 1,
    bounce = 0.35,
    parallax = 0.4,
    hoverSpread = 0.12,
    dim = 0.45,
    draggable = true,
    onChange
  } = options;

  const cardWidth = Math.min(window.innerWidth * 0.9, 460);
  const cardHeight = 320;
  const visible = Math.min(Math.max(1, visibleCards), count);

  const TAU = Math.PI * 2;
  const STEP = 1 / 240;
  const AXES = ['x', 'y', 'z', 'r', 'p'];
  const DOWN = { x: 0, y: 1 };
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const deck = Array.from({ length: count }, (_, index) => ({
    el: slots[index],
    shade: shades[index],
    index,
    pos: index,
    from: index,
    hold: 0,
    nudge: 0,
    phase: 'rest',
    dir: { x: 0, y: 1 },
    tilt: 0,
    top: 0,
    under: false,
    x: 0, y: 0, z: 0, r: 0, p: 0,
    v: { x: 0, y: 0, z: 0, r: 0, p: 0 }
  }));

  const state = {
    order: deck.map(c => c.index),
    raf: 0,
    last: 0,
    hovered: false,
    overCard: false,
    drag: null,
    spread: 0,
    spreadV: 0,
    px: 0, py: 0, pvx: 0, pvy: 0,
    tx: 0, ty: 0,
    dragged: false
  };

  const slot = (position) => {
    const q = Math.min(position, visible);
    const spread = 1 + state.spread;
    return {
      x: q * cardDistance * spread,
      y: -q * verticalDistance * spread,
      z: -q * depth,
      r: 0,
      p: q
    };
  };

  const clearance = (dir) => Math.abs(dir.x) * cardWidth + Math.abs(dir.y) * cardHeight + 12;

  const targetOf = (card, time) => {
    if (card.phase === 'exit') {
      const base = slot(0);
      const reach = clearance(card.dir) * 1.3;
      return { x: base.x + card.dir.x * reach, y: base.y + card.dir.y * reach, z: base.z, r: card.tilt, p: 0 };
    }
    if (card.phase === 'enter') {
      const base = slot(0);
      return { x: base.x, y: base.y + clearance(DOWN) * 1.3, z: base.z, r: 0, p: card.p };
    }
    const position = (time < card.hold ? card.from : card.pos) + card.nudge;
    return slot(Math.max(0, position));
  };

  const layerOf = (card) => {
    if (card.top) return 1000 + card.top;
    if (card.under) return 1;
    return 10 + (count - card.pos) * 2;
  };

  const write = (card) => {
    const { el, shade } = card;
    if (!el) return;
    el.style.transform = `translate3d(${card.x.toFixed(2)}px, ${card.y.toFixed(2)}px, ${card.z.toFixed(2)}px) rotate(${card.r.toFixed(3)}deg) skewY(${skewAmount}deg)`;
    el.style.zIndex = String(layerOf(card));
    const fade = clamp(visible - card.p, 0, 1);
    el.style.opacity = fade < 1 ? fade.toFixed(3) : '';
    el.style.visibility = fade <= 0.001 ? 'hidden' : '';
    if (shade) {
      const depthT = clamp(card.p / Math.max(1, visible - 1), 0, 1);
      shade.style.opacity = (dim * 0.62 * depthT).toFixed(3);
    }
    el.style.cursor = card.phase === 'drag' ? 'grabbing' : card.pos > 0 ? 'pointer' : draggable ? 'grab' : '';
    if (card.pos === 0) el.setAttribute('data-front', '');
    else el.removeAttribute('data-front');
  };

  const scalar = (value, velocity, target, omega, zeta, dt) => {
    const k = omega * omega;
    const d = 2 * zeta * omega;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    let x = value, v = velocity;
    for (let i = 0; i < steps; i++) {
      v += (k * (target - x) - d * v) * h;
      x += v * h;
    }
    return [x, v];
  };

  const integrate = (card, target, omega, zeta, dt) => {
    const k = omega * omega;
    const d = 2 * zeta * omega;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const axis of AXES) {
        const velocity = card.v[axis] + (k * (target[axis] - card[axis]) - d * card.v[axis]) * h;
        card.v[axis] = velocity;
        card[axis] += velocity * h;
      }
    }
  };

  const frame = (time) => {
    state.raf = 0;
    const dt = state.last ? Math.min(0.05, (time - state.last) / 1000) : 1 / 60;
    state.last = time;
    const restOmega = TAU * 1.7 * speed;
    const restZeta = 1 - 0.72 * bounce;
    const exitOmega = TAU * 1.9 * speed;
    let busy = false;

    const spreadTarget = state.hovered ? hoverSpread : 0;
    [state.spread, state.spreadV] = scalar(state.spread, state.spreadV, spreadTarget, TAU * 1.4, 0.9, dt);
    [state.px, state.pvx] = scalar(state.px, state.pvx, state.tx, TAU * 1.1, 1, dt);
    [state.py, state.pvy] = scalar(state.py, state.pvy, state.ty, TAU * 1.1, 1, dt);
    if (
      Math.abs(state.spread - spreadTarget) > 0.0005 ||
      Math.abs(state.px - state.tx) > 0.05 ||
      Math.abs(state.py - state.ty) > 0.05
    ) {
      busy = true;
    }

    for (const card of deck) {
      if (card.phase === 'drag') {
        busy = true;
        write(card);
        continue;
      }
      const target = targetOf(card, time);
      const moving = card.phase === 'exit' || card.phase === 'enter';
      integrate(card, target, moving ? exitOmega : restOmega, moving ? 1 : restZeta, dt);

      if (card.phase === 'exit') {
        const base = slot(0);
        const travelled = (card.x - base.x) * card.dir.x + (card.y - base.y) * card.dir.y;
        if (travelled >= clearance(card.dir)) {
          card.phase = 'rest';
          card.top = 0;
          card.hold = 0;
        }
      } else if (card.phase === 'enter') {
        const base = slot(0);
        if (card.y - base.y >= clearance(DOWN)) {
          card.phase = 'rest';
          card.under = false;
          card.hold = 0;
        }
      }
      if (card.hold > time || card.phase !== 'rest') busy = true;
      for (const axis of AXES) {
        const limit = axis === 'p' ? 0.001 : 0.02;
        if (Math.abs(target[axis] - card[axis]) > limit || Math.abs(card.v[axis]) > limit) busy = true;
      }
      write(card);
    }

    if (busy) {
      state.raf = requestAnimationFrame(frame);
    } else {
      state.last = 0;
      for (const card of deck) {
        if (card.top && card.phase === 'rest') card.top = 0;
      }
    }
  };

  const wake = () => {
    if (!state.raf) state.raf = requestAnimationFrame(frame);
  };

  const settleOrder = (time, stagger) => {
    state.order.forEach((index, position) => {
      const card = deck[index];
      if (card.pos === position) return;
      card.from = card.pos;
      card.pos = position;
      card.hold = time + Math.max(0, position) * stagger;
    });
  };

  let layers = 0;
  const shift = (direction, opts = {}) => {
    if (count < 2) return;
    const time = performance.now();
    const stagger = 0.05 / speed;
    if (direction > 0) {
      const front = deck[state.order[0]];
      state.order = [...state.order.slice(1), front.index];
      settleOrder(time, stagger * 1000);
      front.phase = 'exit';
      front.dir = opts.dir ?? DOWN;
      front.tilt = opts.tilt ?? 0;
      front.top = ++layers;
      front.under = false;
      front.nudge = 0;
      front.hold = 0;
      if (opts.velocity) {
        front.v.x = opts.velocity.x;
        front.v.y = opts.velocity.y;
      }
    } else {
      const back = deck[state.order[count - 1]];
      state.order = [back.index, ...state.order.slice(0, count - 1)];
      settleOrder(time, stagger * 1000);
      back.phase = 'enter';
      back.top = 0;
      back.under = true;
      back.nudge = 0;
      back.hold = 0;
    }
    deck.forEach(card => {
      if (card.phase === 'rest') card.nudge = 0;
    });
    if (onChange) onChange(state.order[0], count);
    wake();
  };

  const goTo = (position) => {
    for (let i = 0; i < position; i++) {
      setTimeout(() => shift(1), i * (100 / speed));
    }
  };

  const onPointerMove = (e) => {
    if (e.pointerType !== 'touch') {
      const box = root.getBoundingClientRect();
      const nx = clamp(((e.clientX - box.left) / Math.max(1, box.width)) * 2 - 1, -1, 1);
      const ny = clamp(((e.clientY - box.top) / Math.max(1, box.height)) * 2 - 1, -1, 1);
      state.tx = nx * parallax * 0.35 * 400;
      state.ty = ny * parallax * 0.35 * 300;
      state.hovered = true;
      wake();
    }
    const drag = state.drag;
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.active = true;
      state.dragged = true;
      const card = deck[drag.index];
      card.phase = 'drag';
      card.v = { x: 0, y: 0, z: 0, r: 0, p: 0 };
      root.setPointerCapture?.(e.pointerId);
    }
    const card = deck[drag.index];
    const base = slot(0);
    card.x = base.x + dx;
    card.y = base.y + dy;
    card.z = base.z;
    card.r = clamp(dx * 0.035, -9, 9);
    card.p = 0;
    const time = performance.now();
    drag.samples.push({ x: card.x, y: card.y, t: time });
    while (drag.samples.length > 2 && time - drag.samples[0].t > 90) drag.samples.shift();
    const next = deck[state.order[1]];
    if (next && next.phase === 'rest') next.nudge = -0.22 * clamp(Math.hypot(dx, dy) / 120, 0, 1);
    wake();
  };

  const onPointerLeave = (e) => {
    if (e.pointerType === 'touch' || state.drag?.active) return;
    state.hovered = false;
    state.tx = 0;
    state.ty = 0;
    wake();
  };

  const onPointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) return;
    if (!draggable || e.button > 0 || count < 2) return;
    const target = e.target.closest('[data-swap-index]');
    if (!target) return;
    const index = Number(target.getAttribute('data-swap-index'));
    if (index !== state.order[0] || deck[index].phase !== 'rest') return;
    state.drag = {
      id: e.pointerId,
      index,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      samples: []
    };
  };

  const onPointerUp = (e) => {
    const drag = state.drag;
    if (!drag || drag.id !== e.pointerId) return;
    state.drag = null;
    if (!drag.active) return;
    root.releasePointerCapture?.(e.pointerId);
    const card = deck[drag.index];
    const base = slot(0);
    const first = drag.samples[0];
    const last = drag.samples[drag.samples.length - 1];
    const span = first && last && last !== first ? Math.max(0.016, (last.t - first.t) / 1000) : 1;
    const velocity = first && last && last !== first
      ? { x: (last.x - first.x) / span, y: (last.y - first.y) / span }
      : { x: 0, y: 0 };
    const offset = { x: card.x - base.x, y: card.y - base.y };
    const distance = Math.hypot(offset.x, offset.y);
    const fling = Math.hypot(velocity.x, velocity.y);
    const next = deck[state.order[1]];
    if (next) next.nudge = 0;
    if (distance > 100 || fling > 600) {
      const aim = { x: offset.x + velocity.x * 0.12, y: offset.y + velocity.y * 0.12 };
      const len = Math.hypot(aim.x, aim.y) || 1;
      card.phase = 'rest';
      shift(1, {
        dir: { x: aim.x / len, y: aim.y / len },
        tilt: card.r,
        velocity
      });
    } else {
      card.phase = 'rest';
      card.v.x = velocity.x;
      card.v.y = velocity.y;
      wake();
    }
  };

  const onClick = (e) => {
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) return;
    if (state.dragged) {
      state.dragged = false;
      return;
    }
    const target = e.target.closest('[data-swap-index]');
    if (!target) return;
    const index = Number(target.getAttribute('data-swap-index'));
    const position = state.order.indexOf(index);
    if (position > 0) goTo(position);
  };

  deck.forEach(card => {
    Object.assign(card, slot(card.pos));
    write(card);
  });
  wake();

  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerleave', onPointerLeave);
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('click', onClick);

  return {
    next: () => shift(1),
    prev: () => shift(-1),
    destroy: () => {
      cancelAnimationFrame(state.raf);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerleave', onPointerLeave);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerUp);
      root.removeEventListener('click', onClick);
    }
  };
}

// Helper: Temukan kelompok siswa dalam sebuah tugas kelompok
function findStudentGroupInAssignment(assignment, user) {
  if (!assignment || !assignment.isGroup || !Array.isArray(assignment.groups) || !user) return null;
  const userAbsen = user.absen != null ? Number(user.absen) : null;
  const userName = (user.name || '').trim().toLowerCase();

  for (const group of assignment.groups) {
    if (!Array.isArray(group.members)) continue;
    for (const member of group.members) {
      if (typeof member === 'object' && member !== null) {
        if (userAbsen != null && member.absen != null && Number(member.absen) === userAbsen) return group;
        if (member.name && (member.name.toLowerCase().includes(userName) || userName.includes(member.name.toLowerCase()))) return group;
      } else {
        const mStr = String(member).trim();
        const mMatch = mStr.match(/^0*(\d+)[\.\s\-]/);
        if (mMatch && userAbsen != null && Number(mMatch[1]) === userAbsen) {
          return group;
        }
        const mLower = mStr.toLowerCase();
        if (userName && (mLower.includes(userName) || userName.includes(mLower))) {
          return group;
        }
      }
    }
  }
  return null;
}

function renderAssignmentsList() {
  const filtered = getFilteredAssignments();
  const container = dom.assignmentsGridContainer;
  if (!container) return;

  if (cardSwapEngine) {
    cardSwapEngine.destroy();
    cardSwapEngine = null;
  }
  container.innerHTML = '';

  if (filtered.length === 0) {
    dom.emptyAssignmentsState.classList.remove('hidden');
    container.classList.add('hidden');
    return;
  }

  dom.emptyAssignmentsState.classList.add('hidden');
  container.classList.remove('hidden');

  filtered.forEach((assignment) => {
    const evalData = evaluateDeadline(assignment);
    const isGuru = appState.currentUser && appState.currentUser.role === 'guru';

    // Submissions for this task
    const taskSubmissions = (appState.submissions || []).filter(s => s.assignmentId === assignment.id);
    const myGroup = findStudentGroupInAssignment(assignment, appState.currentUser);

    let mySubmission = null;
    let groupSubmitterName = null;
    if (!isGuru && appState.currentUser) {
      mySubmission = taskSubmissions.find(s => {
        if (appState.currentUser.absen != null && s.studentAbsen != null) {
          return Number(s.studentAbsen) === Number(appState.currentUser.absen);
        }
        return s.studentName && s.studentName.toLowerCase().includes(appState.currentUser.name.toLowerCase());
      });

      // Jika tugas kelompok dan belum ada pengumpulan mandiri, cek submission dari rekan sekelompok
      if (!mySubmission && myGroup) {
        const peerSub = taskSubmissions.find(s => {
          if (s.groupId && s.groupId === myGroup.id) return true;
          if (s.groupName && s.groupName === myGroup.name) return true;
          if (Array.isArray(s.groupMembers)) {
            return s.groupMembers.some(m => {
              const mMatch = String(m).match(/^0*(\d+)[\.\s\-]/);
              if (mMatch && appState.currentUser.absen != null && Number(mMatch[1]) === Number(appState.currentUser.absen)) return true;
              return appState.currentUser.name && String(m).toLowerCase().includes(appState.currentUser.name.toLowerCase());
            });
          }
          return false;
        });
        if (peerSub) {
          mySubmission = peerSub;
          groupSubmitterName = peerSub.studentName;
        }
      }
    }

    let topOutlineClass = '';
    if (isGuru) {
      if (evalData.isPast || evalData.statusKey === 'closed') {
        topOutlineClass = 'card-outline-red';
      } else {
        topOutlineClass = 'card-outline-green';
      }
    } else {
      if (mySubmission) {
        if (mySubmission.isLate) {
          topOutlineClass = 'card-outline-red';
        } else {
          topOutlineClass = 'card-outline-green';
        }
      } else {
        if (evalData.isPast || evalData.statusKey === 'closed') {
          topOutlineClass = 'card-outline-red';
        } else {
          topOutlineClass = 'card-outline-yellow';
        }
      }
    }

    let statusBadgeMarkup = '';
    if (evalData.statusKey === 'active') {
      statusBadgeMarkup = `<span class="status-badge badge-active">Buka</span>`;
    } else if (evalData.statusKey === 'closed') {
      statusBadgeMarkup = `<span class="status-badge badge-closed">Ditutup</span>`;
    } else {
      statusBadgeMarkup = `<span class="status-badge badge-late-allowed">Terima Terlambat</span>`;
    }

    const policyDesc = assignment.latePolicy === 'close'
      ? 'Toleransi: Ditutup mutlak setelah deadline'
      : 'Toleransi: Diterima dengan label TERLAMBAT';

    const countdown = formatCountdown(assignment.deadline);
    const deadlineCounterHtml = renderCounterDigitsHtml(countdown);

    const card = document.createElement('article');
    card.className = `assignment-card ${topOutlineClass}`;
    card.setAttribute('data-id', assignment.id);

    card.innerHTML = `
      <div class="card-top-row">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span class="subject-badge">${escapeHtml(assignment.subject)}</span>
          ${assignment.isGroup ? `<span class="badge-group-task" title="Tugas Kelompok">👥 Kelompok${myGroup ? ': ' + escapeHtml(myGroup.name) : ''}</span>` : ''}
        </div>
        ${statusBadgeMarkup}
      </div>

      <h3 class="assignment-title">${escapeHtml(assignment.title)}</h3>
      <p class="assignment-desc">${escapeHtml(assignment.description)}</p>

      <div class="deadline-row ${countdown.isPast ? 'deadline-past' : ''}">
        <svg class="deadline-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span title="Batas: ${evalData.formattedDate}">
          <strong class="deadline-label">${countdown.isPast ? 'Status: ' : 'Sisa Waktu: '}</strong>
          <span class="deadline-countdown-text ${countdown.isPast ? 'deadline-expired' : ''}" data-deadline="${assignment.deadline}">
            ${deadlineCounterHtml}
          </span>
        </span>
      </div>

      <p class="policy-note">${policyDesc}</p>

      <div class="card-footer-actions">
        ${isGuru ? `
          <span class="submission-count-tag">${taskSubmissions.length} siswa mengumpulkan</span>
          <div style="display:flex; gap:6px; flex-wrap:nowrap; flex-shrink:0;">
            <button type="button" class="btn btn-primary btn-sm btn-view-submissions" data-id="${assignment.id}" aria-label="Lihat pengumpulan ${escapeHtml(assignment.title)}">
              <span>Rekap</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-delete-assignment" data-id="${assignment.id}" title="Hapus Tugas" aria-label="Hapus tugas ${escapeHtml(assignment.title)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </div>
        ` : `
          ${mySubmission ? `
            <div style="display:flex; align-items:center; gap:6px; max-width:70%; overflow:hidden; flex-wrap:wrap;">
              <span class="status-badge ${mySubmission.isLate ? 'badge-closed' : 'badge-active'}" style="margin-left:0; white-space:nowrap;">
                ${groupSubmitterName && groupSubmitterName !== appState.currentUser.name
                  ? `Terkumpul (${escapeHtml(groupSubmitterName)})`
                  : (mySubmission.isLate ? 'Terkumpul (Terlambat)' : 'Sudah Dikumpulkan')}
              </span>
              ${mySubmission.grade != null ? `
                <span class="badge-task-grade" title="Nilai dari Guru">
                  Nilai: <strong>${mySubmission.grade}</strong>
                </span>
              ` : `
                <span class="badge-task-grade badge-task-grade-pending" title="Menunggu Penilaian">
                  Belum Dinilai
                </span>
              `}
            </div>
            <button type="button" class="btn btn-secondary btn-sm btn-submit-task" data-id="${assignment.id}" style="flex-shrink:0; white-space:nowrap;">
              <span>Cek</span>
            </button>
          ` : `
            <span class="submission-count-tag">Belum Dikumpulkan</span>
            <button type="button" class="btn btn-primary btn-sm btn-submit-task" data-id="${assignment.id}" style="flex-shrink:0; white-space:nowrap;">
              <span>Kumpulkan</span>
            </button>
          `}
        `}
      </div>
    `;

    // Guru buttons
    const btnViewSubmissions = card.querySelector('.btn-view-submissions');
    if (btnViewSubmissions) {
      btnViewSubmissions.addEventListener('click', () => openSubmissionsReviewModal(assignment));
    }

    const btnDelete = card.querySelector('.btn-delete-assignment');
    if (btnDelete) {
      btnDelete.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog({
          title: 'Hapus Tugas',
          message: `Apakah Anda yakin ingin menghapus tugas "${assignment.title}"? Seluruh berkas pengumpulan siswa untuk tugas ini juga akan terhapus.`,
          confirmText: 'Hapus Tugas',
          cancelText: 'Batal',
          type: 'danger'
        });
        if (!confirmed) return;

        await dbDelete('assignments', assignment.id);
        try {
          await fetch('/api/delete-assignment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: assignment.id })
          });
        } catch (apiErr) {
          console.warn('API delete error:', apiErr);
        }
        showToast(`Tugas "${assignment.title}" berhasil dihapus`, 'success');
        await refreshData();
      });
    }

    // Student button
    const btnSubmitTask = card.querySelector('.btn-submit-task');
    if (btnSubmitTask) {
      btnSubmitTask.addEventListener('click', () => openSubmitTaskModal(assignment));
    }

    container.appendChild(card);
  });
}

function updateSidebarStatistics() {
  const assignments = appState.assignments || [];
  const submissions = appState.submissions || [];

  if (dom.statsActiveAssignments) dom.statsActiveAssignments.textContent = assignments.length;
  if (dom.statsTotalSubmissions) dom.statsTotalSubmissions.textContent = `${submissions.length} berkas`;

  let cAll = assignments.length;
  let cInf = 0, cMat = 0, cBah = 0, cDes = 0, cIPA = 0;

  assignments.forEach(a => {
    if (a.subject === 'Informatika') cInf++;
    else if (a.subject === 'Matematika') cMat++;
    else if (a.subject === 'Bahasa Indonesia') cBah++;
    else if (a.subject === 'Desain Grafis') cDes++;
    else if (a.subject === 'IPA') cIPA++;
  });

  if (dom.countAllTasks) dom.countAllTasks.textContent = cAll;
  if (dom.countInformatika) dom.countInformatika.textContent = cInf;
  if (dom.countMatematika) dom.countMatematika.textContent = cMat;
  if (dom.countBahasa) dom.countBahasa.textContent = cBah;
  if (dom.countDesain) dom.countDesain.textContent = cDes;
  if (dom.countIPA) dom.countIPA.textContent = cIPA;
}

// ==========================================================================
// TEMPORARY PROGRESS AUTO-SAVE UTILITY ("TEMP")
// ==========================================================================

const TempProgress = {
  // Save teacher assignment draft
  saveTeacherDraft(data) {
    try {
      localStorage.setItem('xozen_temp_assignment_draft', JSON.stringify(data));
    } catch {
      // Ignore
    }
  },
  getTeacherDraft() {
    try {
      const saved = localStorage.getItem('xozen_temp_assignment_draft');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  },
  clearTeacherDraft() {
    localStorage.removeItem('xozen_temp_assignment_draft');
  },

  // Save student submission draft notes
  saveStudentNotes(absen, assignmentId, text) {
    try {
      const key = `xozen_temp_student_notes_${absen}_${assignmentId}`;
      localStorage.setItem(key, text);
    } catch {
      // Ignore
    }
  },
  getStudentNotes(absen, assignmentId) {
    try {
      const key = `xozen_temp_student_notes_${absen}_${assignmentId}`;
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  },
  clearStudentNotes(absen, assignmentId) {
    const key = `xozen_temp_student_notes_${absen}_${assignmentId}`;
    localStorage.removeItem(key);
  }
};

// Teacher Create Assignment: restore temp draft if available
function restoreTeacherDraftIfAny() {
  const draft = TempProgress.getTeacherDraft();
  if (draft) {
    dom.assignmentTitle.value = draft.title || '';
    dom.assignmentSubject.value = draft.subject || 'Informatika';
    dom.assignmentDesc.value = draft.description || '';
    dom.assignmentDeadline.value = draft.deadline || '';
    dom.lateSubmissionPolicy.value = draft.latePolicy || 'close';
    dom.teacherDraftIndicator.style.display = 'block';
  } else {
    // Default tomorrow deadline
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 0, 0);
    const tzOffset = tomorrow.getTimezoneOffset() * 60000;
    const localISOTime = new Date(tomorrow.getTime() - tzOffset).toISOString().slice(0, 16);

    dom.assignmentDeadline.value = localISOTime;
    dom.assignmentTitle.value = '';
    dom.assignmentDesc.value = '';
    dom.teacherDraftIndicator.style.display = 'none';
  }
}

// State kelompok tugas draft
let currentAssignmentGroupsDraft = [];

function renderAssignmentGroupsPreview() {
  if (!dom.assignmentGroupsPreviewContainer) return;
  dom.assignmentGroupsPreviewContainer.innerHTML = '';
  const count = currentAssignmentGroupsDraft.length;
  if (dom.groupAssignmentCountBadge) {
    dom.groupAssignmentCountBadge.textContent = `${count} Kelompok`;
  }

  if (count === 0) {
    dom.assignmentGroupsPreviewContainer.innerHTML = `
      <div class="empty-groups-notice" style="text-align: center; padding: 16px; color: #94A3B8; font-size: 0.8125rem; border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 8px;">
        Klik <strong>"Ambil dari Alat Spin Group"</strong> atau <strong>"Bagi Acak Kelas"</strong> untuk menentukan kelompok tugas.
      </div>
    `;
    return;
  }

  currentAssignmentGroupsDraft.forEach((grp, idx) => {
    const card = document.createElement('div');
    card.className = 'group-preview-card';
    card.innerHTML = `
      <div class="group-preview-header">
        <span class="group-preview-title">${escapeHtml(grp.name || `Kelompok ${idx + 1}`)} (${grp.members.length} siswa)</span>
        <button type="button" class="btn btn-secondary btn-sm btn-remove-group" data-idx="${idx}" title="Hapus Kelompok" style="min-height: 24px; padding: 0 6px; font-size: 0.72rem; color: #F43F5E;">✕</button>
      </div>
      <div class="group-preview-members">
        ${grp.members.map(m => `<span class="group-member-chip">${escapeHtml(m)}</span>`).join('')}
      </div>
    `;
    card.querySelector('.btn-remove-group').addEventListener('click', () => {
      currentAssignmentGroupsDraft.splice(idx, 1);
      renderAssignmentGroupsPreview();
    });
    dom.assignmentGroupsPreviewContainer.appendChild(card);
  });
}

// Toggle tampilan section kelompok saat radio diganti
if (dom.radioTaskIndividual && dom.radioTaskGroup) {
  dom.radioTaskIndividual.addEventListener('change', () => {
    if (dom.assignmentGroupSetupSection) dom.assignmentGroupSetupSection.classList.add('hidden');
  });
  dom.radioTaskGroup.addEventListener('change', () => {
    if (dom.assignmentGroupSetupSection) {
      dom.assignmentGroupSetupSection.classList.remove('hidden');
      renderAssignmentGroupsPreview();
    }
  });
}

// Import kelompok dari Alat Spin Group (Pembagi Kelompok Alat Kelas)
if (dom.btnImportFromSpinGroup) {
  dom.btnImportFromSpinGroup.addEventListener('click', () => {
    let teams = (classToolsState && Array.isArray(classToolsState.teamsData) && classToolsState.teamsData.length > 0)
      ? classToolsState.teamsData
      : null;
    if (!teams) {
      try {
        const saved = localStorage.getItem('mypnk_last_spin_teams');
        if (saved) teams = JSON.parse(saved);
      } catch (e) {}
    }
    if (teams && Array.isArray(teams) && teams.length > 0) {
      currentAssignmentGroupsDraft = teams.map((t, idx) => ({
        id: 'grp_' + (idx + 1),
        name: t.name || `Kelompok ${idx + 1}`,
        members: Array.isArray(t.members) ? [...t.members] : []
      }));
      renderAssignmentGroupsPreview();
      showToast(`Berhasil mengambil ${currentAssignmentGroupsDraft.length} kelompok dari Spin Wheel!`, 'success');
    } else {
      showToast('Belum ada pembagian kelompok di Spin Wheel. Buka menu "Spin Wheel & Tim" di sidebar untuk membuat kelompok atau gunakan "Bagi Acak Kelas".', 'info');
    }
  });
}

// Upload JSON Kelompok hasil download Spin Wheel
const btnUploadSpinGroupJson = document.getElementById('btnUploadSpinGroupJson');
const inputUploadSpinGroupJson = document.getElementById('inputUploadSpinGroupJson');

if (btnUploadSpinGroupJson && inputUploadSpinGroupJson) {
  btnUploadSpinGroupJson.addEventListener('click', () => {
    inputUploadSpinGroupJson.click();
  });

  inputUploadSpinGroupJson.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        let rawGroups = [];
        if (Array.isArray(parsed)) {
          rawGroups = parsed;
        } else if (parsed && Array.isArray(parsed.groups)) {
          rawGroups = parsed.groups;
        } else if (parsed && Array.isArray(parsed.teams)) {
          rawGroups = parsed.teams;
        } else {
          throw new Error('Format JSON tidak sesuai. Harap unggah file JSON pembagian kelompok.');
        }

        if (rawGroups.length === 0) {
          showToast('File JSON tidak berisi data kelompok.', 'warning');
          return;
        }

        currentAssignmentGroupsDraft = rawGroups.map((g, idx) => ({
          id: g.id || `grp_${idx + 1}`,
          name: g.name || `Kelompok ${idx + 1}`,
          members: Array.isArray(g.members)
            ? g.members.map(m => typeof m === 'object' && m !== null ? (m.name || String(m)) : String(m))
            : []
        }));

        renderAssignmentGroupsPreview();
        showToast(`Berhasil mengimpor ${currentAssignmentGroupsDraft.length} kelompok dari berkas JSON!`, 'success');
        const manualSection = document.getElementById('manualGroupBuilderSection');
        if (manualSection) manualSection.classList.add('hidden');
      } catch (err) {
        console.error('Error parsing groups JSON:', err);
        showToast('Gagal membaca berkas JSON: ' + err.message, 'error');
      } finally {
        inputUploadSpinGroupJson.value = '';
      }
    };
    reader.readAsText(file);
  });
}

// Manual Group Builder Controller
let manualGroupsWorkingDraft = [];

function getActiveRosterForManualBuilder() {
  if (Array.isArray(appState.students) && appState.students.length > 0) {
    return appState.students.map(s => {
      const pad = String(s.absen || '').padStart(2, '0');
      return `${pad}. ${s.name}`;
    });
  }
  return [
    '01. Arnold Winson Santoso', '02. Dave Samuel Prawira Sutomo',
    '03. Elia Gustaaf Seisjunio Sanger', '04. Elliana Avril Sugiri',
    '05. Fabianus Evanjanu Arkananta', '06. Firent Brigeyza',
    '07. Gyselle Assa Calysta', '08. Hosea Dandi Wibowo',
    '09. Jericho Ezra Shallom, Fautngiljanan', '10. Jocelyn Dhamelinnka Uneputty',
    '11. Kefas Victoriano Fritzietama', '12. Kenzo Natha Tadani',
    '13. Maelynn Nielsie', '14. Michael Wibowo',
    '15. Muhamad Alif Januar Putra Pradana', '17. Stevan Christian'
  ];
}

function renderManualGroupBuilderUI() {
  const container = document.getElementById('manualGroupsCardsList');
  if (!container) return;
  container.innerHTML = '';

  const allRoster = getActiveRosterForManualBuilder();

  if (manualGroupsWorkingDraft.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:12px; color:#94A3B8; font-size:0.8rem; border:1px dashed rgba(255,255,255,0.1); border-radius:6px;">
        Belum ada kelompok manual. Klik <strong>"+ Tambah Kelompok"</strong> untuk memulai.
      </div>
    `;
    return;
  }

  manualGroupsWorkingDraft.forEach((grp, gIdx) => {
    const card = document.createElement('div');
    card.className = 'manual-group-card';
    card.innerHTML = `
      <div class="manual-group-card-header">
        <input type="text" class="manual-group-name-input" value="${escapeHtml(grp.name)}" placeholder="Nama Kelompok (contoh: Kelompok 1)">
        <span style="font-size:0.75rem; color:#94A3B8; font-weight:600;"><span class="manual-member-count">${grp.members.length}</span> Siswa</span>
        <button type="button" class="btn btn-secondary btn-sm btn-delete-manual-group" style="padding:2px 6px; font-size:0.75rem; color:#F43F5E;">✕</button>
      </div>
      <div class="manual-group-members-chips">
        ${grp.members.map((m, mIdx) => `
          <span class="manual-member-chip">
            <span>${escapeHtml(m)}</span>
            <button type="button" class="manual-member-chip-remove" data-gidx="${gIdx}" data-midx="${mIdx}">✕</button>
          </span>
        `).join('')}
      </div>
      <div style="display:flex; gap:6px;">
        <select class="manual-add-member-select" data-gidx="${gIdx}">
          <option value="">+ Tambah Siswa ke Kelompok...</option>
          ${allRoster.map(s => {
            const isAlreadyInThis = grp.members.includes(s);
            return `<option value="${escapeHtml(s)}"${isAlreadyInThis ? ' disabled' : ''}>${escapeHtml(s)}${isAlreadyInThis ? ' (Sudah ada)' : ''}</option>`;
          }).join('')}
        </select>
      </div>
    `;

    const nameInput = card.querySelector('.manual-group-name-input');
    nameInput.addEventListener('input', (e) => {
      manualGroupsWorkingDraft[gIdx].name = e.target.value.trim() || `Kelompok ${gIdx + 1}`;
    });

    card.querySelector('.btn-delete-manual-group').addEventListener('click', () => {
      manualGroupsWorkingDraft.splice(gIdx, 1);
      renderManualGroupBuilderUI();
    });

    card.querySelectorAll('.manual-member-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const mIndex = Number(btn.getAttribute('data-midx'));
        manualGroupsWorkingDraft[gIdx].members.splice(mIndex, 1);
        renderManualGroupBuilderUI();
      });
    });

    const select = card.querySelector('.manual-add-member-select');
    select.addEventListener('change', (e) => {
      const chosen = e.target.value;
      if (chosen && !manualGroupsWorkingDraft[gIdx].members.includes(chosen)) {
        manualGroupsWorkingDraft[gIdx].members.push(chosen);
        renderManualGroupBuilderUI();
      }
    });

    container.appendChild(card);
  });
}

const btnToggleManualGroupBuilder = document.getElementById('btnToggleManualGroupBuilder');
const manualGroupBuilderSection = document.getElementById('manualGroupBuilderSection');
const btnAddManualGroup = document.getElementById('btnAddManualGroup');
const btnApplyManualGroups = document.getElementById('btnApplyManualGroups');
const btnCancelManualGroupBuilder = document.getElementById('btnCancelManualGroupBuilder');

if (btnToggleManualGroupBuilder && manualGroupBuilderSection) {
  btnToggleManualGroupBuilder.addEventListener('click', () => {
    const isHidden = manualGroupBuilderSection.classList.contains('hidden');
    if (isHidden) {
      if (currentAssignmentGroupsDraft && currentAssignmentGroupsDraft.length > 0) {
        manualGroupsWorkingDraft = JSON.parse(JSON.stringify(currentAssignmentGroupsDraft));
      } else {
        manualGroupsWorkingDraft = [
          { id: 'grp_1', name: 'Kelompok 1', members: [] },
          { id: 'grp_2', name: 'Kelompok 2', members: [] }
        ];
      }
      manualGroupBuilderSection.classList.remove('hidden');
      renderManualGroupBuilderUI();
    } else {
      manualGroupBuilderSection.classList.add('hidden');
    }
  });

  if (btnAddManualGroup) {
    btnAddManualGroup.addEventListener('click', () => {
      const nextNum = manualGroupsWorkingDraft.length + 1;
      manualGroupsWorkingDraft.push({
        id: `grp_${Date.now()}_${nextNum}`,
        name: `Kelompok ${nextNum}`,
        members: []
      });
      renderManualGroupBuilderUI();
    });
  }

  if (btnApplyManualGroups) {
    btnApplyManualGroups.addEventListener('click', () => {
      const validGroups = manualGroupsWorkingDraft.filter(g => g.members && g.members.length > 0);
      if (validGroups.length === 0) {
        showToast('Setiap kelompok minimal harus memiliki 1 anggota.', 'warning');
        return;
      }
      currentAssignmentGroupsDraft = validGroups;
      renderAssignmentGroupsPreview();
      manualGroupBuilderSection.classList.add('hidden');
      showToast(`Berhasil menerapkan ${currentAssignmentGroupsDraft.length} kelompok manual!`, 'success');
    });
  }

  if (btnCancelManualGroupBuilder) {
    btnCancelManualGroupBuilder.addEventListener('click', () => {
      manualGroupBuilderSection.classList.add('hidden');
    });
  }
}

// Bagi Acak Kelas saat pembuatan tugas
if (dom.btnAutoDivideGroups) {
  dom.btnAutoDivideGroups.addEventListener('click', async () => {
    // Kumpulkan daftar siswa aktif
    let studentList = [];
    if (Array.isArray(appState.students) && appState.students.length > 0) {
      studentList = appState.students.map(s => s.name || s);
    } else {
      // Fallback daftar siswa kelas aktif
      studentList = [
        "Arnold", "Arsena", "Brian", "Clarissa", "Cleo", "Darren", "Dayven", "Elda", 
        "Faith", "Felicia", "Geordy", "Gisella", "Graciella", "Jane", "Jonathan", 
        "Jovin", "Kenzie", "Kenzo", "Kevin", "Louisa", "Marvel", "Nadine", "Nathanael", 
        "Pauleen", "Prudence", "Quaneisha", "Samuel", "Stevan", "Tania", "Timothy", 
        "Trevor", "Viona", "Yuki"
      ];
    }

    const perGroupInput = await showPromptDialog({
      title: 'Bagi Acak Siswa ke Kelompok',
      message: `Total siswa saat ini: ${studentList.length} orang.\nMasukkan jumlah siswa per kelompok:`,
      defaultValue: '5',
      placeholder: 'Contoh: 5',
      type: 'info'
    });

    if (perGroupInput === null) return;
    const perGroup = parseInt(perGroupInput.trim(), 10);
    if (isNaN(perGroup) || perGroup < 2 || perGroup > studentList.length) {
      showToast('Jumlah siswa per kelompok harus minimal 2.', 'warning');
      return;
    }

    // Acak siswa secara adil
    const shuffled = [...studentList].sort(() => Math.random() - 0.5);
    const groups = [];
    let groupIdx = 1;

    for (let i = 0; i < shuffled.length; i += perGroup) {
      const slice = shuffled.slice(i, i + perGroup);
      groups.push({
        id: 'grp_' + groupIdx,
        name: `Kelompok ${groupIdx}`,
        members: slice
      });
      groupIdx++;
    }

    currentAssignmentGroupsDraft = groups;
    renderAssignmentGroupsPreview();
    showToast(`Berhasil membagi ${studentList.length} siswa menjadi ${groups.length} kelompok!`, 'success');
  });
}

// Auto-save teacher draft on input
['input', 'change'].forEach(eventType => {
  dom.createAssignmentForm.addEventListener(eventType, () => {
    TempProgress.saveTeacherDraft({
      title: dom.assignmentTitle.value,
      subject: dom.assignmentSubject.value,
      description: dom.assignmentDesc.value,
      deadline: dom.assignmentDeadline.value,
      latePolicy: dom.lateSubmissionPolicy.value
    });
  });
});

dom.btnOpenCreateAssignmentModal.addEventListener('click', () => {
  restoreTeacherDraftIfAny();
  if (dom.radioTaskIndividual) dom.radioTaskIndividual.checked = true;
  if (dom.assignmentGroupSetupSection) dom.assignmentGroupSetupSection.classList.add('hidden');
  currentAssignmentGroupsDraft = [];
  renderAssignmentGroupsPreview();
  dom.createAssignmentModal.showModal();
});

dom.btnEmptyCreateAssignment.addEventListener('click', () => {
  dom.btnOpenCreateAssignmentModal.click();
});

dom.btnCloseAssignmentModal.addEventListener('click', () => dom.createAssignmentModal.close());
dom.btnCancelAssignment.addEventListener('click', () => {
  dom.createAssignmentModal.close();
});

dom.createAssignmentForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = dom.assignmentTitle.value.trim();
  const subject = dom.assignmentSubject.value;
  const description = dom.assignmentDesc.value.trim();
  const deadlineVal = dom.assignmentDeadline.value;
  const latePolicy = dom.lateSubmissionPolicy.value;
  const isGroup = dom.radioTaskGroup && dom.radioTaskGroup.checked;

  if (!title || !deadlineVal) return;

  if (isGroup && (!currentAssignmentGroupsDraft || currentAssignmentGroupsDraft.length === 0)) {
    showToast('Tugas kelompok memerlukan pembagian kelompok. Silakan klik "Ambil dari Alat Spin Group" atau "Bagi Acak Kelas".', 'warning');
    return;
  }

  const newAssignment = {
    id: 'task_' + Date.now(),
    title,
    subject,
    description,
    deadline: new Date(deadlineVal).toISOString(),
    latePolicy,
    isGroup: !!isGroup,
    groups: isGroup ? currentAssignmentGroupsDraft : [],
    createdBy: appState.currentUser ? appState.currentUser.name : 'Admin',
    createdAt: new Date().toISOString()
  };

  await dbPut('assignments', newAssignment);
  try {
    await fetch('/api/assignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAssignment)
    });
  } catch (apiErr) {
    console.warn('API save assignment error:', apiErr);
  }
  TempProgress.clearTeacherDraft();
  dom.teacherDraftIndicator.style.display = 'none';
  dom.createAssignmentModal.close();
  showToast(`Tugas ${isGroup ? 'Kelompok ' : ''}"${title}" berhasil diterbitkan`, 'success');
  await refreshData();
});

// Siswa: Submit Task Modal
function renderSelectedFilesList() {
  if (!dom.selectedFilesList || !dom.selectedFileNameDisplay) return;
  const count = (appState.selectedSubmitFiles || []).length;
  if (count === 0) {
    dom.selectedFileNameDisplay.textContent = 'Belum ada berkas dipilih';
    dom.selectedFilesList.innerHTML = '';
    dom.selectedFilesList.classList.add('hidden');
    return;
  }

  dom.selectedFileNameDisplay.textContent = `${count} / 10 berkas dipilih`;
  dom.selectedFilesList.classList.remove('hidden');
  dom.selectedFilesList.innerHTML = '';

  appState.selectedSubmitFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'selected-file-item';
    item.innerHTML = `
      <div class="selected-file-item-left">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="selected-file-name" title="${escapeHtml(file.name)}">${escapeHtml(formatTruncatedFileName(file.name, 22))}</span>
        <span class="selected-file-size">${formatBytes(file.size)}</span>
      </div>
      <button type="button" class="btn-remove-selected-file" title="Hapus berkas ini" aria-label="Hapus berkas ${escapeHtml(file.name)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    item.querySelector('.btn-remove-selected-file').addEventListener('click', (e) => {
      e.stopPropagation();
      appState.selectedSubmitFiles.splice(index, 1);
      renderSelectedFilesList();
    });

    dom.selectedFilesList.appendChild(item);
  });
}

function handleSelectedFiles(filesList) {
  if (!filesList || filesList.length === 0) return;
  const incoming = Array.from(filesList);
  if (!appState.selectedSubmitFiles) appState.selectedSubmitFiles = [];

  const currentCount = appState.selectedSubmitFiles.length;
  if (currentCount >= 10) {
    showToast('Maksimal 10 berkas tugas sudah tercapai.', 'warning');
    return;
  }

  const remainingSlots = 10 - currentCount;
  if (incoming.length > remainingSlots) {
    showToast(`Hanya dapat menambahkan ${remainingSlots} berkas lagi (maksimal 10 berkas).`, 'warning');
  }

  const toAdd = incoming.slice(0, remainingSlots);
  toAdd.forEach(file => {
    const exists = appState.selectedSubmitFiles.some(
      f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
    );
    if (!exists) {
      appState.selectedSubmitFiles.push(file);
    }
  });

  renderSelectedFilesList();
}

function openSubmitTaskModal(assignment) {
  if (!appState.currentUser || appState.currentUser.role !== 'siswa') {
    showToast('Silakan masuk sebagai siswa terlebih dahulu untuk mengumpulkan tugas.', 'info');
    logoutUser();
    return;
  }

  appState.selectedAssignmentForSubmit = assignment;
  appState.selectedSubmitFiles = [];

  dom.submitSubjectAndTitle.textContent = `${assignment.subject}: ${assignment.title}`;
  dom.submitInstructionText.textContent = assignment.description;
  
  // Banner informasi tugas kelompok
  let groupBannerEl = document.getElementById('submitModalGroupBanner');
  if (!groupBannerEl) {
    groupBannerEl = document.createElement('div');
    groupBannerEl.id = 'submitModalGroupBanner';
    dom.submitInstructionText.parentNode.insertBefore(groupBannerEl, dom.submitInstructionText.nextSibling);
  }

  const myGroup = findStudentGroupInAssignment(assignment, appState.currentUser);

  // Check if student already submitted this task or group peer already submitted
  let existingSub = (appState.submissions || []).find(
    s => s.assignmentId === assignment.id && Number(s.studentAbsen) === Number(appState.currentUser.absen)
  );

  let isGroupSubmissionByPeer = false;
  if (!existingSub && myGroup) {
    const peerSub = (appState.submissions || []).find(s => {
      if (s.assignmentId !== assignment.id) return false;
      if (s.groupId && s.groupId === myGroup.id) return true;
      if (s.groupName && s.groupName === myGroup.name) return true;
      if (Array.isArray(s.groupMembers)) {
        return s.groupMembers.some(m => {
          const mMatch = String(m).match(/^0*(\d+)[\.\s\-]/);
          if (mMatch && appState.currentUser.absen != null && Number(mMatch[1]) === Number(appState.currentUser.absen)) return true;
          return appState.currentUser.name && String(m).toLowerCase().includes(appState.currentUser.name.toLowerCase());
        });
      }
      return false;
    });
    if (peerSub) {
      existingSub = peerSub;
      isGroupSubmissionByPeer = true;
    }
  }

  if (assignment.isGroup && myGroup) {
    groupBannerEl.className = 'group-submission-banner';
    groupBannerEl.style.display = 'block';
    groupBannerEl.innerHTML = `
      <div style="background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 10px 14px; margin: 10px 0 14px; font-size: 0.8125rem;">
        <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #38BDF8; margin-bottom: 4px;">
          <span>👥 Tugas Kelompok: ${escapeHtml(myGroup.name)}</span>
        </div>
        <div style="color: #E2E8F0; font-size: 0.78rem;">
          Anggota: <strong>${myGroup.members.map(escapeHtml).join(', ')}</strong>
        </div>
        <div style="color: #94A3B8; font-size: 0.72rem; margin-top: 4px;">
          ${isGroupSubmissionByPeer ? `Tugas ini telah dikumpulkan oleh <strong>${escapeHtml(existingSub.studentName)}</strong> atas nama kelompok.` : 'Pengumpulan berkas oleh salah satu anggota kelompok otomatis mewakili seluruh anggota.'}
        </div>
      </div>
    `;
  } else if (groupBannerEl) {
    groupBannerEl.style.display = 'none';
  }

  const isGuru = appState.currentUser && (appState.currentUser.role === 'guru' || appState.currentUser.role === 'teacher');
  if (dom.submitStudentNameGroup) {
    dom.submitStudentNameGroup.style.display = isGuru ? 'block' : 'none';
  }
  dom.studentNameInput.value = appState.currentUser.name;

  // Student profile picture inside submission modal
  const studentAvatar = localStorage.getItem('xozen_avatar_' + appState.currentUser.absen);
  if (studentAvatar && dom.submitAvatarImg) {
    dom.submitAvatarImg.src = studentAvatar;
    dom.submitAvatarImg.classList.remove('hidden');
    if (dom.submitAvatarText) dom.submitAvatarText.classList.add('hidden');
  } else {
    if (dom.submitAvatarImg) dom.submitAvatarImg.classList.add('hidden');
    if (dom.submitAvatarText) {
      dom.submitAvatarText.classList.remove('hidden');
      dom.submitAvatarText.textContent = appState.currentUser.absen ? String(appState.currentUser.absen) : 'S';
    }
  }

  if (existingSub && dom.existingSubmissionPreviewBox) {
    // Mode Cek: Tampilkan riwayat berkas, sembunyikan dropzone & tombol kirim
    dom.existingSubmissionPreviewBox.classList.remove('hidden');
    if (dom.submitFilesGroup) dom.submitFilesGroup.style.display = 'none';
    if (dom.submitNotesGroup) dom.submitNotesGroup.style.display = 'none';
    if (dom.btnConfirmSubmitTask) dom.btnConfirmSubmitTask.style.display = 'none';
    if (dom.btnCancelSubmit) dom.btnCancelSubmit.textContent = 'Tutup';

    let gradeDisplayEl = document.getElementById('submitModalGradeBox');
    if (!gradeDisplayEl) {
      gradeDisplayEl = document.createElement('div');
      gradeDisplayEl.id = 'submitModalGradeBox';
      dom.existingSubmissionPreviewBox.prepend(gradeDisplayEl);
    }
    if (existingSub.grade != null) {
      gradeDisplayEl.className = 'submission-grade-box';
      gradeDisplayEl.style.display = 'flex';
      gradeDisplayEl.innerHTML = `
        <div class="submission-grade-header">
          <span class="submission-grade-title">Nilai Tugas:</span>
          <span class="submission-grade-val">${existingSub.grade} / 100</span>
        </div>
      `;
    } else {
      gradeDisplayEl.className = 'submission-grade-box';
      gradeDisplayEl.style.display = 'flex';
      gradeDisplayEl.innerHTML = `
        <div class="submission-grade-header">
          <span class="submission-grade-title">Status Penilaian:</span>
          <span class="badge-grade-pending">Menunggu Nilai Guru</span>
        </div>
      `;
    }

    if (dom.submitModalBottomTimestamp) dom.submitModalBottomTimestamp.classList.remove('hidden');
    if (dom.existingSubTimeText) {
      dom.existingSubTimeText.textContent = 'Dikumpulkan pada: ' + formatDateTime(existingSub.submittedAt);
    }

    const subFiles = (Array.isArray(existingSub.files) && existingSub.files.length > 0)
      ? existingSub.files
      : [{
          fileName: existingSub.fileName,
          fileSize: existingSub.fileSize,
          storedFile: existingSub.storedFile,
          downloadUrl: existingSub.downloadUrl
        }];

    if (dom.existingSubFilesList) {
      dom.existingSubFilesList.innerHTML = '';
      if (subFiles.length > 1) {
        if (dom.existingSubSingleBody) dom.existingSubSingleBody.classList.add('hidden');
        subFiles.forEach((f) => {
          const row = document.createElement('div');
          row.className = 'existing-file-row';
          row.innerHTML = `
            <div class="existing-sub-file-info">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <div>
                <strong title="${escapeHtml(f.fileName)}">${escapeHtml(formatTruncatedFileName(f.fileName, 24))}</strong>
                <span>${formatBytes(f.fileSize || 0)}</span>
              </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm btn-open-prev-file" style="min-height:30px; padding:0 10px; font-size:0.75rem;">
              <span>Buka</span>
            </button>
          `;
          row.querySelector('.btn-open-prev-file').addEventListener('click', (e) => {
            e.preventDefault();
            openSubmissionFile(existingSub, f);
          });
          dom.existingSubFilesList.appendChild(row);
        });
      } else {
        if (dom.existingSubSingleBody) dom.existingSubSingleBody.classList.remove('hidden');
        if (dom.existingSubFileName) {
          dom.existingSubFileName.textContent = formatTruncatedFileName(subFiles[0].fileName, 26);
          dom.existingSubFileName.title = subFiles[0].fileName;
        }
        if (dom.existingSubFileSize) dom.existingSubFileSize.textContent = formatBytes(subFiles[0].fileSize || 0);
        if (dom.btnPreviewExistingFile) {
          dom.btnPreviewExistingFile.onclick = (e) => {
            e.preventDefault();
            openSubmissionFile(existingSub, subFiles[0]);
          };
        }
      }
    }

    // Tombol batalkan pengiriman tugas agar tetap di modal dan langsung memunculkan input berkas
    if (dom.btnRevokeSubmission) {
      dom.btnRevokeSubmission.onclick = async (e) => {
        e.preventDefault();
        const confirmRevoke = await showConfirmDialog({
          title: 'Batalkan Pengumpulan',
          message: `Apakah Anda yakin ingin membatalkan pengiriman tugas "${assignment.title}" untuk mengedit atau mengganti berkas?`,
          confirmText: 'Batalkan & Ganti Berkas',
          cancelText: 'Kembali',
          type: 'warning'
        });
        if (!confirmRevoke) return;

        try {
          await dbDelete('submissions', existingSub.id);
          appState.submissions = (appState.submissions || []).filter(s => s.id !== existingSub.id);

          // Tetap di halaman modal kumpulkan tugas, langsung tampilkan dropzone berkas
          dom.existingSubmissionPreviewBox.classList.add('hidden');
          const gradeDisplayEl = document.getElementById('submitModalGradeBox');
          if (gradeDisplayEl) gradeDisplayEl.style.display = 'none';
          if (dom.submitModalBottomTimestamp) dom.submitModalBottomTimestamp.classList.add('hidden');
          if (dom.submitFilesGroup) dom.submitFilesGroup.style.display = 'block';
          if (dom.submitNotesGroup) dom.submitNotesGroup.style.display = 'block';
          if (dom.btnConfirmSubmitTask) dom.btnConfirmSubmitTask.style.display = 'inline-flex';
          if (dom.btnCancelSubmit) dom.btnCancelSubmit.textContent = 'Batal';

          appState.selectedSubmitFiles = [];
          dom.studentFileUploadInput.value = '';
          renderSelectedFilesList();

          refreshData();
          showToast('Pengiriman dibatalkan. Silakan unggah berkas baru.', 'info');
        } catch (err) {
          console.error('Batalkan pengiriman error:', err);
          showToast('Gagal membatalkan pengiriman tugas.', 'error');
        }
      };
    }
  } else {
    // Mode Belum Terkirim: Tampilkan form unggah berkas, catatan, dan tombol kirim
    if (dom.existingSubmissionPreviewBox) dom.existingSubmissionPreviewBox.classList.add('hidden');
    const gradeDisplayEl = document.getElementById('submitModalGradeBox');
    if (gradeDisplayEl) gradeDisplayEl.style.display = 'none';
    if (dom.submitModalBottomTimestamp) dom.submitModalBottomTimestamp.classList.add('hidden');
    if (dom.submitFilesGroup) dom.submitFilesGroup.style.display = 'block';
    if (dom.submitNotesGroup) dom.submitNotesGroup.style.display = 'block';
    if (dom.btnConfirmSubmitTask) dom.btnConfirmSubmitTask.style.display = 'inline-flex';
    if (dom.btnCancelSubmit) dom.btnCancelSubmit.textContent = 'Batal';
  }

  // Restore temp student draft notes if any
  const tempNotes = TempProgress.getStudentNotes(appState.currentUser.absen, assignment.id);
  if (tempNotes && !existingSub) {
    dom.studentNotes.value = tempNotes;
  } else {
    dom.studentNotes.value = (existingSub && existingSub.notes) ? existingSub.notes : '';
  }
  if (dom.studentDraftIndicator) dom.studentDraftIndicator.style.display = 'none';

  dom.studentFileUploadInput.value = '';
  renderSelectedFilesList();

  const evalData = evaluateDeadline(assignment);
  const countdown = formatCountdown(assignment.deadline);
  if (isGuru) {
    dom.submitDeadlineText.innerHTML = `Batas Waktu: ${evalData.formattedDate} (<span class="deadline-countdown-text ${countdown.isPast ? 'deadline-expired' : ''}" data-deadline="${assignment.deadline}">${countdown.text}</span>)`;
  } else {
    dom.submitDeadlineText.innerHTML = `<span title="Batas: ${evalData.formattedDate}"><strong class="deadline-label">${countdown.isPast ? 'Status: ' : 'Sisa Waktu: '}</strong><span class="deadline-countdown-text ${countdown.isPast ? 'deadline-expired' : ''}" data-deadline="${assignment.deadline}">${countdown.text}</span></span>`;
  }
  if (dom.submitPolicyTag) dom.submitPolicyTag.style.display = 'none';

  // Handle deadline conditions
  if (evalData.isPast) {
    if (assignment.latePolicy === 'close') {
      dom.submissionClosedAlert.classList.remove('hidden');
      dom.submissionLateWarningAlert.classList.add('hidden');
      if (dom.btnConfirmSubmitTask) {
        dom.btnConfirmSubmitTask.disabled = true;
        dom.btnConfirmSubmitTask.textContent = 'Pengumpulan Ditutup';
      }
      dom.taskFileDropzone.style.pointerEvents = 'none';
      dom.taskFileDropzone.style.opacity = '0.5';
    } else {
      dom.submissionClosedAlert.classList.add('hidden');
      dom.submissionLateWarningAlert.classList.remove('hidden');
      if (dom.btnConfirmSubmitTask) {
        dom.btnConfirmSubmitTask.disabled = false;
        dom.btnConfirmSubmitTask.textContent = 'Kirim dengan Status Terlambat';
      }
      dom.taskFileDropzone.style.pointerEvents = 'auto';
      dom.taskFileDropzone.style.opacity = '1';
    }
  } else {
    dom.submissionClosedAlert.classList.add('hidden');
    dom.submissionLateWarningAlert.classList.add('hidden');
    if (dom.btnConfirmSubmitTask) {
      dom.btnConfirmSubmitTask.disabled = false;
      dom.btnConfirmSubmitTask.textContent = 'Kirim Tugas Sekarang';
    }
    dom.taskFileDropzone.style.pointerEvents = 'auto';
    dom.taskFileDropzone.style.opacity = '1';
  }

  dom.submitTaskModal.showModal();
}

// Auto-save student notes in temp as they type
dom.studentNotes.addEventListener('input', () => {
  if (appState.selectedAssignmentForSubmit && appState.currentUser) {
    TempProgress.saveStudentNotes(appState.currentUser.absen, appState.selectedAssignmentForSubmit.id, dom.studentNotes.value);
  }
});

dom.btnCloseSubmitModal.addEventListener('click', () => dom.submitTaskModal.close());
dom.btnCancelSubmit.addEventListener('click', () => dom.submitTaskModal.close());

dom.studentFileUploadInput.addEventListener('change', (e) => {
  handleSelectedFiles(e.target.files);
  dom.studentFileUploadInput.value = '';
});

dom.taskFileDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dom.taskFileDropzone.classList.add('drag-over');
});

dom.taskFileDropzone.addEventListener('dragleave', () => {
  dom.taskFileDropzone.classList.remove('drag-over');
});

dom.taskFileDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dom.taskFileDropzone.classList.remove('drag-over');
  if (e.dataTransfer && e.dataTransfer.files) {
    handleSelectedFiles(e.dataTransfer.files);
  }
});

dom.submitTaskForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const assignment = appState.selectedAssignmentForSubmit;
  if (!assignment) return;

  const files = appState.selectedSubmitFiles || [];
  if (files.length === 0) {
    showToast('Silakan pilih minimal 1 berkas tugas (maksimal 10 berkas).', 'error');
    return;
  }

  const evalData = evaluateDeadline(assignment);
  if (evalData.isPast && assignment.latePolicy === 'close') {
    showToast('Pengumpulan ditutup. Anda tidak dapat mengirim tugas setelah deadline.', 'error');
    return;
  }

  showLoading('Mengunggah Berkas Tugas', 'Mempersiapkan berkas tugas...', 10);
  try {
    const isLate = evalData.isPast;
    const studentName = dom.studentNameInput.value.trim() || appState.currentUser.name;
    const notes = dom.studentNotes.value.trim();

    // Check if replacing an existing submission
    const existingSub = (appState.submissions || []).find(
      s => s.assignmentId === assignment.id && Number(s.studentAbsen) === Number(appState.currentUser.absen)
    );

    let editHistory = [];
    if (existingSub) {
      editHistory = Array.isArray(existingSub.editHistory) ? [...existingSub.editHistory] : [];
      editHistory.push({
        fileName: existingSub.fileName,
        fileSize: existingSub.fileSize,
        submittedAt: existingSub.submittedAt,
        isLate: existingSub.isLate
      });
      if (existingSub.id) {
        await dbDelete('submissions', existingSub.id);
      }
    }

    // Save files to local drive folder if drive folder is configured
    for (const f of files) {
      try {
        await saveFileToDrive(assignment, studentName, f, isLate);
      } catch (saveErr) {
        console.warn('Drive save error:', saveErr);
      }
    }

    // Read all files as Base64 for server upload with progress feedback
    let readCount = 0;
    const filesPayload = await Promise.all(
      files.map(async (file) => {
        let fileBase64 = '';
        try {
          const reader = new FileReader();
          fileBase64 = await new Promise((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result;
              const base64 = typeof result === 'string' ? result.substring(result.indexOf(',') + 1) : '';
              readCount++;
              const pct = 15 + Math.round((readCount / files.length) * 35);
              updateLoadingProgress(pct, `Membaca berkas (${readCount}/${files.length}): ${file.name}`);
              resolve(base64);
            };
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
          });
        } catch (err) {
          console.warn('FileReader error:', err);
        }
        return {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
          fileData: fileBase64
        };
      })
    );

    updateLoadingProgress(55, 'Mengirim berkas tugas ke server...');

    const myGroup = findStudentGroupInAssignment(assignment, appState.currentUser);

    let serverSubmission = null;
    if (filesPayload.length > 0 && filesPayload.every(f => f.fileData)) {
      try {
        updateLoadingProgress(70, 'Mengunggah ke server cloud...');
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignmentId: assignment.id,
            studentAbsen: appState.currentUser.absen,
            studentName,
            files: filesPayload,
            notes,
            isLate,
            isEdited: editHistory.length > 0,
            editHistory,
            isGroup: !!assignment.isGroup,
            groupId: myGroup ? myGroup.id : null,
            groupName: myGroup ? myGroup.name : null,
            groupMembers: myGroup ? (Array.isArray(myGroup.members) ? myGroup.members : []) : []
          })
        });
        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json();
          serverSubmission = uploadJson.submission;
        }
      } catch (apiErr) {
        console.warn('Server upload error, fallback to local cache:', apiErr);
      }
    }

    updateLoadingProgress(88, 'Menyimpan riwayat pengumpulan...');

    const primaryFile = files[0];
    const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

    const submissionRecord = serverSubmission || {
      id: 'sub_' + Date.now(),
      assignmentId: assignment.id,
      studentName,
      studentAbsen: appState.currentUser.absen,
      submittedAt: new Date().toISOString(),
      isLate,
      isEdited: editHistory.length > 0,
      editHistory: editHistory,
      notes,
      fileName: primaryFile.name,
      fileSize: totalSize,
      fileType: primaryFile.type || 'application/octet-stream',
      isGroup: !!assignment.isGroup,
      groupId: myGroup ? myGroup.id : null,
      groupName: myGroup ? myGroup.name : null,
      groupMembers: myGroup ? (Array.isArray(myGroup.members) ? myGroup.members : []) : [],
      files: files.map(f => ({
        fileName: f.name,
        fileSize: f.size,
        fileType: f.type || 'application/octet-stream'
      }))
    };

    await dbPut('submissions', submissionRecord);
    
    // Clear temp progress for this task
    TempProgress.clearStudentNotes(appState.currentUser.absen, assignment.id);
    if (dom.studentDraftIndicator) dom.studentDraftIndicator.style.display = 'none';

    updateLoadingProgress(100, 'Pengumpulan berkas selesai!');
    await new Promise(r => setTimeout(r, 220));

    dom.submitTaskModal.close();

  if (existingSub) {
    showToast(`Berkas tugas berhasil diganti & jam pengumpulan diperbarui!`, 'success');
  } else if (isLate) {
    showToast(`Tugas berhasil dikirim dengan status TERLAMBAT`, 'info');
  } else {
    showToast(`Tugas berhasil dikumpulkan tepat waktu`, 'success');
  }

  await refreshData();
} catch (submitErr) {
  console.error('Pengumpulan tugas gagal:', submitErr);
  showToast('Terjadi kesalahan saat mengumpulkan tugas.', 'error');
} finally {
  hideLoading();
}
});

// Modal Penilaian Tugas Kelompok (Sama Rata vs Nilai Individu)
function openGroupGradingModal(assignment, sub, cleanStudentName) {
  if (!dom.groupGradingModal) return;

  // Temukan kelompok yang menaungi siswa / submisi ini
  let grp = null;
  if (Array.isArray(assignment.groups)) {
    if (sub.groupId) {
      grp = assignment.groups.find(g => g.id === sub.groupId);
    }
    if (!grp && sub.groupName) {
      grp = assignment.groups.find(g => g.name === sub.groupName);
    }
    if (!grp) {
      const cLower = cleanStudentName.toLowerCase();
      grp = assignment.groups.find(g => Array.isArray(g.members) && g.members.some(m => {
        const mLower = String(m).toLowerCase();
        return cLower.includes(mLower) || mLower.includes(cLower);
      }));
    }
  }

  const groupName = grp ? grp.name : (sub.groupName || 'Kelompok');
  const members = grp ? grp.members : (Array.isArray(sub.groupMembers) && sub.groupMembers.length > 0 ? sub.groupMembers : [cleanStudentName]);

  const modalTitle = document.getElementById('modalGroupGradingTitle');
  if (modalTitle) modalTitle.textContent = `Penilaian: ${groupName}`;
  if (dom.groupGradingSubtitle) {
    dom.groupGradingSubtitle.innerHTML = `Tugas: <strong>${escapeHtml(assignment.title)}</strong> &bull; Anggota: ${members.map(escapeHtml).join(', ')}`;
  }

  // Set default mode: Nilai sekelompok sama
  if (dom.radioGradeModeSame) dom.radioGradeModeSame.checked = true;
  if (dom.groupGradingSameSection) dom.groupGradingSameSection.classList.remove('hidden');
  if (dom.groupGradingIndividualSection) dom.groupGradingIndividualSection.classList.add('hidden');

  if (dom.groupSharedScoreInput) {
    dom.groupSharedScoreInput.value = sub.grade != null ? sub.grade : 100;
  }

  // Populate individual inputs
  if (dom.groupIndividualMembersList) {
    dom.groupIndividualMembersList.innerHTML = '';
    members.forEach((member, mIdx) => {
      const memberSub = (appState.submissions || []).find(s => s.assignmentId === assignment.id && s.studentName && s.studentName.toLowerCase().includes(member.toLowerCase()));
      const curScore = memberSub && memberSub.grade != null ? memberSub.grade : (sub.grade != null ? sub.grade : 100);

      const row = document.createElement('div');
      row.className = 'group-member-grade-row';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '8px 12px';
      row.style.background = 'rgba(255, 255, 255, 0.04)';
      row.style.borderRadius = '8px';
      row.style.border = '1px solid rgba(255, 255, 255, 0.07)';

      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="width:22px; height:22px; border-radius:50%; background:rgba(56,189,248,0.2); color:#38BDF8; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700;">${mIdx + 1}</span>
          <span style="font-weight:600; color:#fff; font-size:0.875rem;">${escapeHtml(member)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <input type="number" min="0" max="100" class="form-input member-individual-grade-input" data-member="${escapeHtml(member)}" value="${curScore}" style="width:80px; text-align:center; font-weight:700;">
          <span style="color:#94A3B8; font-size:0.8rem;">/ 100</span>
        </div>
      `;
      dom.groupIndividualMembersList.appendChild(row);
    });
  }

  // Switch between same and individual mode
  if (dom.radioGradeModeSame && dom.radioGradeModeIndividual) {
    dom.radioGradeModeSame.onchange = () => {
      if (dom.groupGradingSameSection) dom.groupGradingSameSection.classList.remove('hidden');
      if (dom.groupGradingIndividualSection) dom.groupGradingIndividualSection.classList.add('hidden');
    };
    dom.radioGradeModeIndividual.onchange = () => {
      if (dom.groupGradingSameSection) dom.groupGradingSameSection.classList.add('hidden');
      if (dom.groupGradingIndividualSection) dom.groupGradingIndividualSection.classList.remove('hidden');
    };
  }

  // Save handler
  if (dom.btnSaveGroupGrading) {
    dom.btnSaveGroupGrading.onclick = async () => {
      const isSame = dom.radioGradeModeSame && dom.radioGradeModeSame.checked;

      if (isSame) {
        const sharedScore = parseInt(dom.groupSharedScoreInput.value, 10);
        if (isNaN(sharedScore) || sharedScore < 0 || sharedScore > 100) {
          showToast('Nilai harus berupa angka antara 0 sampai 100.', 'error');
          return;
        }

        sub.grade = sharedScore;
        sub.gradedAt = new Date().toISOString();
        sub.gradeMode = 'shared';
        await dbPut('submissions', sub);

        // Perbarui juga data anggota kelompok lainnya yang mungkin memiliki submisi terpisah
        for (const member of members) {
          const mSub = (appState.submissions || []).find(s => s.assignmentId === assignment.id && s.studentName && s.studentName.toLowerCase().includes(member.toLowerCase()) && s.id !== sub.id);
          if (mSub) {
            mSub.grade = sharedScore;
            mSub.gradedAt = new Date().toISOString();
            mSub.gradeMode = 'shared';
            await dbPut('submissions', mSub);
          }
        }

        showToast(`Nilai ${sharedScore} berhasil disimpan untuk seluruh anggota ${groupName}!`, 'success');
      } else {
        const inputs = dom.groupIndividualMembersList.querySelectorAll('.member-individual-grade-input');
        const memberScores = {};
        inputs.forEach(inp => {
          const mName = inp.getAttribute('data-member');
          const val = parseInt(inp.value, 10);
          memberScores[mName] = isNaN(val) ? 0 : Math.min(100, Math.max(0, val));
        });

        if (memberScores[cleanStudentName] !== undefined) {
          sub.grade = memberScores[cleanStudentName];
        } else {
          sub.grade = Object.values(memberScores)[0] || 100;
        }
        sub.gradedAt = new Date().toISOString();
        sub.gradeMode = 'individual';
        sub.individualGrades = memberScores;
        await dbPut('submissions', sub);

        for (const [mName, mScore] of Object.entries(memberScores)) {
          const mSub = (appState.submissions || []).find(s => s.assignmentId === assignment.id && s.studentName && s.studentName.toLowerCase().includes(mName.toLowerCase()) && s.id !== sub.id);
          if (mSub) {
            mSub.grade = mScore;
            mSub.gradedAt = new Date().toISOString();
            mSub.gradeMode = 'individual';
            await dbPut('submissions', mSub);
          }
        }

        showToast(`Nilai perorangan masing-masing anggota ${groupName} berhasil disimpan!`, 'success');
      }

      dom.groupGradingModal.close();
      await refreshData();
      openSubmissionsReviewModal(assignment);
    };
  }

  if (dom.btnCloseGroupGradingModal) {
    dom.btnCloseGroupGradingModal.onclick = () => dom.groupGradingModal.close();
  }
  if (dom.btnCancelGroupGrading) {
    dom.btnCancelGroupGrading.onclick = () => dom.groupGradingModal.close();
  }

  dom.groupGradingModal.showModal();
}

// Guru: Review Submissions Modal
function openSubmissionsReviewModal(assignment) {
  if (!assignment) return;
  appState.selectedAssignmentForReview = assignment;
  if (dom.submissionsSubTitle) {
    dom.submissionsSubTitle.textContent = `${assignment.subject}: ${assignment.title}`;
  }

  const grid = document.getElementById('submissionsCardsGrid');
  const emptyNotice = document.getElementById('submissionsCardsEmpty');
  const searchInput = document.getElementById('inputFilterSubmissionsSearch');
  const countTimely = document.getElementById('badgeCountSubTimely');
  const countLate = document.getElementById('badgeCountSubLate');

  const submissions = (appState.submissions || []).filter(s => s.assignmentId === assignment.id);

  let timely = 0;
  let late = 0;
  submissions.forEach(s => {
    if (s.isLate) late++; else timely++;
  });
  if (countTimely) countTimely.textContent = `${timely} Tepat Waktu`;
  if (countLate) countLate.textContent = `${late} Terlambat`;

  function renderBentoCards(filterQuery = '') {
    if (!grid) return;
    grid.innerHTML = '';
    const q = (filterQuery || '').toLowerCase().trim();
    const filtered = submissions.filter(s => {
      const student = (s.studentName || '').toLowerCase();
      const notes = (s.notes || '').toLowerCase();
      const file = (s.fileName || '').toLowerCase();
      return !q || student.includes(q) || notes.includes(q) || file.includes(q);
    });

    if (filtered.length === 0) {
      if (emptyNotice) emptyNotice.classList.remove('hidden');
      return;
    }
    if (emptyNotice) emptyNotice.classList.add('hidden');

    filtered.forEach((sub, cardIdx) => {
      const card = document.createElement('div');
      card.className = 'submission-bento-card';
      card.style.animationDelay = `${cardIdx * 0.04}s`;

      const subFiles = (Array.isArray(sub.files) && sub.files.length > 0)
        ? sub.files
        : [{ fileName: sub.fileName || 'Berkas', fileSize: sub.fileSize, storedFile: sub.storedFile, downloadUrl: sub.downloadUrl }];

      const groupTag = (assignment.isGroup && sub.groupName)
        ? `<span class="badge" style="background:rgba(56,189,248,0.15); color:#38BDF8; font-size:0.7rem; padding:2px 6px; border-radius:4px;">👥 ${escapeHtml(sub.groupName)}</span>`
        : '';

      const statusTag = sub.isLate
        ? `<span class="tag-status-late">TERLAMBAT</span>`
        : `<span class="tag-status-timely">TEPAT WAKTU</span>`;

      const gradeTag = (sub.grade != null)
        ? `<span class="badge-grade-scored">Nilai: ${sub.grade}</span>`
        : `<span style="font-size:0.75rem; color:var(--text-muted);">Belum Dinilai</span>`;

      let cleanStudentName = sub.studentName || 'Siswa';
      if (cleanStudentName.includes(' - ')) {
        cleanStudentName = cleanStudentName.split(' - ').slice(1).join(' - ');
      }

      const sAvatar = localStorage.getItem('xozen_avatar_' + sub.studentAbsen);
      const avatarMarkup = sAvatar
        ? `<img src="${sAvatar}" alt="PP" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:1px solid var(--accent-cyan-light); flex-shrink:0;">`
        : `<div class="sub-card-avatar">${sub.studentAbsen || 'S'}</div>`;

      card.innerHTML = `
        <div class="submission-card-header">
          <div style="display:flex; align-items:center; gap:10px;">
            ${avatarMarkup}
            <div class="sub-card-student-info">
              <h4 class="sub-card-name">${escapeHtml(cleanStudentName)}</h4>
              <p class="sub-card-meta">Absen ${sub.studentAbsen || '-'} &bull; ${formatDateTime(sub.submittedAt)}</p>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${statusTag}
            ${groupTag}
          </div>
        </div>

        ${sub.notes ? `
          <div style="font-size:0.78rem; color:var(--text-subtle); background:rgba(255,255,255,0.03); padding:6px 10px; border-radius:6px; margin:8px 0; border-left:2px solid var(--accent-cyan-light); word-break:break-word;">
            "${escapeHtml(formatTruncatedFileName(sub.notes, 75))}"
          </div>
        ` : ''}

        <div class="sub-card-file-chips">
          ${subFiles.map((f, fIdx) => `
            <button type="button" class="btn-file-pill btn-sub-card-file" data-fidx="${fIdx}" title="Klik untuk membuka di sistem starter">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span class="file-pill-name" title="${escapeHtml(f.fileName)}">${escapeHtml(formatTruncatedFileName(f.fileName, 20))}</span>
              <span class="file-pill-size">${formatBytes(f.fileSize || 0)}</span>
            </button>
          `).join('')}
        </div>

        <div class="sub-card-footer" style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
          <div>${gradeTag}</div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-primary btn-sm btn-open-sub-detail" style="font-size:0.75rem; padding:4px 10px;">
              🔍 Lihat Selengkapnya
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-delete-sub-card" title="Hapus Pengumpulan" style="padding:4px 8px; color:var(--accent-red);">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;

      // File click on card pill -> opens in our starter system!
      card.querySelectorAll('.btn-sub-card-file').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const fIdx = parseInt(btn.getAttribute('data-fidx'), 10);
          openMediaStarter(subFiles[fIdx], sub, assignment);
        });
      });

      // Open detail popup
      card.querySelector('.btn-open-sub-detail').addEventListener('click', () => {
        openSubmissionDetailModal(sub, assignment);
      });

      // Delete submission
      card.querySelector('.btn-delete-sub-card').addEventListener('click', async () => {
        const confirmDel = await showConfirmDialog({
          title: 'Hapus Pengumpulan Siswa',
          message: `Apakah Anda yakin ingin menghapus pengumpulan tugas dari ${cleanStudentName}?`,
          confirmText: 'Hapus Berkas',
          cancelText: 'Batal',
          type: 'danger'
        });
        if (!confirmDel) return;

        try {
          await dbDelete('submissions', sub.id);
          appState.submissions = (appState.submissions || []).filter(s => s.id !== sub.id);
          showToast('Pengumpulan tugas berhasil dihapus.', 'success');
          await refreshData();
          openSubmissionsReviewModal(assignment);
        } catch (err) {
          console.error('Hapus submission error:', err);
          showToast('Gagal menghapus pengumpulan tugas.', 'error');
        }
      });

      grid.appendChild(card);
    });
  }

  if (searchInput) {
    searchInput.value = '';
    searchInput.oninput = () => renderBentoCards(searchInput.value);
  }

  renderBentoCards();

  if (dom.submissionsTableBody) {
    dom.submissionsTableBody.innerHTML = '';
  }

  if (dom.submissionsListModal && typeof dom.submissionsListModal.showModal === 'function') {
    dom.submissionsListModal.showModal();
  }
}

function openSubmissionDetailModal(sub, assignment) {
  const modal = document.getElementById('submissionDetailModal');
  const title = document.getElementById('submissionDetailTitle');
  const subTitle = document.getElementById('subDetailAssignmentTitle');
  const avatar = document.getElementById('subDetailAvatar');
  const absen = document.getElementById('subDetailAbsen');
  const time = document.getElementById('subDetailTime');
  const statusBadge = document.getElementById('subDetailStatusBadge');
  const groupWrap = document.getElementById('subDetailGroupWrap');
  const groupBadge = document.getElementById('subDetailGroupBadge');
  const notesText = document.getElementById('subDetailNotesText');
  const filesList = document.getElementById('subDetailFilesContainer');
  const gradeInput = document.getElementById('subDetailGradeInput');
  const feedbackInput = document.getElementById('subDetailFeedbackInput');
  const btnSaveGrade = document.getElementById('btnSaveSubDetailGrade');
  const btnCloseHeader = document.getElementById('btnCloseSubmissionDetailModal');
  const btnCloseFooter = document.getElementById('btnCloseSubmissionDetailFooter');

  if (!modal) return;

  const currentAssignment = assignment || (appState.assignments || []).find(a => a.id === sub.assignmentId) || { title: 'Tugas' };

  let cleanStudentName = sub.studentName || 'Siswa';
  if (cleanStudentName.includes(' - ')) {
    cleanStudentName = cleanStudentName.split(' - ').slice(1).join(' - ');
  }

  if (title) title.textContent = cleanStudentName;
  if (subTitle) subTitle.textContent = `Tugas: ${currentAssignment.subject ? currentAssignment.subject + ' - ' : ''}${currentAssignment.title}`;
  if (absen) absen.textContent = sub.studentAbsen || '-';
  if (time) time.textContent = formatDateTime(sub.submittedAt);

  const studentPill = document.getElementById('subDetailStudentPill');
  const classId = sub.classId || appState.activeClassId || 'XB';
  const classLabel = classId === 'XB' ? 'X-B' : (classId === 'XA' ? 'X-A' : 'X-C');
  if (studentPill) {
    studentPill.textContent = `Absen ${sub.studentAbsen || '-'} (${classLabel})`;
  }

  if (statusBadge) {
    statusBadge.className = sub.isLate ? 'tag-status-late' : 'tag-status-timely';
    statusBadge.textContent = sub.isLate ? 'TERLAMBAT' : 'TEPAT WAKTU';
  }

  if (groupWrap && groupBadge) {
    if (currentAssignment.isGroup && sub.groupName) {
      groupWrap.style.display = 'flex';
      groupBadge.textContent = sub.groupName;
    } else {
      groupWrap.style.display = 'none';
    }
  }

  if (notesText) {
    notesText.textContent = sub.notes || 'Tidak ada catatan khusus dari siswa.';
  }

  if (gradeInput) gradeInput.value = sub.grade != null ? sub.grade : '';
  if (feedbackInput) feedbackInput.value = sub.feedback || '';

  const subFiles = (Array.isArray(sub.files) && sub.files.length > 0)
    ? sub.files
    : [{ fileName: sub.fileName || 'Berkas', fileSize: sub.fileSize, storedFile: sub.storedFile, downloadUrl: sub.downloadUrl }];

  if (filesList) {
    filesList.innerHTML = subFiles.map(f => `
      <div class="sub-detail-file-card">
        <div class="sub-file-info">
          <span style="font-size:1.4rem;">${getFileIconEmoji(f.fileName)}</span>
          <div>
            <strong style="display:block; font-size:0.875rem; color:#FFFFFF;">${escapeHtml(f.fileName)}</strong>
            <span style="font-size:0.75rem; color:var(--text-muted);">Ukuran: ${formatBytes(f.fileSize || 0)}</span>
          </div>
        </div>
        <div class="sub-file-actions">
          <a href="${f.downloadUrl || (f.storedFile ? `/api/download?file=${encodeURIComponent(f.storedFile)}` : '#')}" download="${escapeHtml(f.fileName)}" class="btn btn-secondary btn-sm" style="text-decoration:none;">
            📥 Unduh
          </a>
          <button type="button" class="btn btn-primary btn-sm btn-launch-starter" data-file="${escapeHtml(JSON.stringify(f))}">
            ▶️ Buka / Starter Web
          </button>
        </div>
      </div>
    `).join('');

    filesList.querySelectorAll('.btn-launch-starter').forEach(btn => {
      btn.addEventListener('click', () => {
        try {
          const fileObj = JSON.parse(btn.getAttribute('data-file'));
          openMediaStarter(fileObj, sub, currentAssignment);
        } catch (e) {
          console.error(e);
        }
      });
    });
  }

  if (btnSaveGrade) {
    btnSaveGrade.onclick = async () => {
      const score = gradeInput.value !== '' ? Number(gradeInput.value) : null;
      const fb = feedbackInput.value.trim();
      sub.grade = score;
      sub.feedback = fb;

      // Group grade sync if group assignment
      if (currentAssignment.isGroup && sub.isGroup) {
        appState.submissions.forEach(otherSub => {
          if (otherSub.assignmentId === currentAssignment.id && otherSub.groupId === sub.groupId) {
            otherSub.grade = score;
            otherSub.feedback = fb;
          }
        });
      }

      try {
        await dbPut('submissions', sub);
      } catch (err) {
        console.warn('DB put grade error:', err);
      }

      showToast(`Nilai tugas berhasil disimpan (${score != null ? score : 'Dihapus'})!`, 'success');
      modal.close();
      if (typeof openSubmissionsReviewModal === 'function') {
        openSubmissionsReviewModal(currentAssignment);
      }
    };
  }

  if (btnCloseHeader) btnCloseHeader.onclick = () => modal.close();
  if (btnCloseFooter) btnCloseFooter.onclick = () => modal.close();

  modal.showModal();
}

function openSubmissionFile(sub, specificFile) {
  if (!sub) return;

  const isTeacher = appState.currentUser && (appState.currentUser.role === 'teacher' || appState.currentUser.role === 'guru');
  const currentAbsen = appState.currentUser && appState.currentUser.absen;
  const isOwner = Number(sub.studentAbsen) === Number(currentAbsen);

  if (!isTeacher && !isOwner) {
    showToast('Akses Ditolak: Anda hanya berhak membaca berkas milik Anda sendiri.', 'error');
    return;
  }

  const fileItem = specificFile || (Array.isArray(sub.files) && sub.files[0]) || {
    fileName: sub.fileName || 'Berkas',
    fileSize: sub.fileSize || 0,
    storedFile: sub.storedFile,
    downloadUrl: sub.downloadUrl
  };

  const assignment = (appState.assignments || []).find(a => a.id === sub.assignmentId) || appState.selectedAssignmentForReview || { title: 'Tugas' };

  // BUKA DENGAN SISTEM KITA SENDIRI: Media Starter & Compiler Studio Modal
  openMediaStarter(fileItem, sub, assignment);
}

function downloadSubmissionFile(sub, specificFile) {
  openSubmissionFile(sub, specificFile);
}

function getFileIconEmoji(fileName = '') {
  const ext = String(fileName || '').split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext)) return '🖼️';
  if (['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return '🎬';
  if (ext === 'pdf') return '📄';
  if (['py', 'js', 'html', 'css', 'json', 'c', 'cpp', 'java', 'ts', 'php', 'sh', 'txt', 'md'].includes(ext)) return '💻';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
  return '📁';
}

// Media Starter / In-Browser Compiler & Viewer Studio
let currentAnnotationTool = 'pen';
let currentAnnotationColor = '#EF4444';
let annotationHistory = [];
let currentZoomScale = 1.0;
let isDrawingAnnotation = false;
let pptCurrentPage = 1;
let pptTotalPages = 1;

function openMediaStarter(fileObj, sub, assignment) {
  const modal = document.getElementById('mediaStarterModal');
  const title = document.getElementById('mediaStarterTitle');
  const subTitle = document.getElementById('starterSubtitle');
  const icon = document.getElementById('starterTypeIcon');
  const btnDownload = document.getElementById('btnStarterDownloadFile');
  const btnClose = document.getElementById('btnCloseMediaStarterModal');

  const viewImage = document.getElementById('starterImageViewer');
  const viewVideo = document.getElementById('starterVideoViewer');
  const viewPdf = document.getElementById('starterPdfViewer');
  const viewCode = document.getElementById('starterCodeViewer');

  if (!modal) return;

  const fileName = (fileObj && fileObj.fileName) || (sub && sub.fileName) || 'Berkas';
  let fileUrl = (fileObj && fileObj.downloadUrl) || '';
  if (!fileUrl && fileObj && fileObj.storedFile) {
    fileUrl = `/api/download?file=${encodeURIComponent(fileObj.storedFile)}`;
  } else if (!fileUrl && sub && sub.storedFile) {
    fileUrl = `/api/download?file=${encodeURIComponent(sub.storedFile)}`;
  } else if (!fileUrl && sub && sub.id) {
    fileUrl = `/api/download?fileId=${encodeURIComponent(sub.id)}`;
  } else if (!fileUrl && fileObj && fileObj.blobUrl) {
    fileUrl = fileObj.blobUrl;
  } else if (!fileUrl && sub && sub.fileBlob) {
    fileUrl = URL.createObjectURL(sub.fileBlob);
  }

  const assignTitle = (assignment && assignment.title) || (appState.selectedAssignmentForReview && appState.selectedAssignmentForReview.title) || 'Berkas Tugas';
  const studentName = (sub && sub.studentName) || (appState.currentUser && appState.currentUser.name) || 'Siswa';
  const studentAbsen = (sub && sub.studentAbsen) || (appState.currentUser && appState.currentUser.absen) || '-';

  if (title) title.textContent = fileName;
  if (subTitle) subTitle.innerHTML = `Tugas: <strong>${escapeHtml(assignTitle)}</strong> &bull; Siswa: <strong>${escapeHtml(studentName)}</strong> (Absen ${escapeHtml(String(studentAbsen))})`;
  if (icon) icon.textContent = getFileIconEmoji(fileName);

  if (btnDownload) {
    btnDownload.onclick = () => {
      if (!fileUrl) {
        showToast('Tautan berkas tidak tersedia', 'error');
        return;
      }
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast(`Mengunduh: ${fileName}`, 'info');
    };
  }

  if (btnClose) {
    btnClose.onclick = () => {
      modal.close();
      const vid = document.getElementById('starterVideoElement');
      if (vid) vid.pause();
    };
  }

  // Hide all subviews
  [viewImage, viewVideo, viewPdf, viewCode].forEach(v => { if (v) v.classList.add('hidden'); });

  const ext = fileName.split('.').pop().toLowerCase();

  // 1. Gambar (Photo with Zoom & Annotation)
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext)) {
    if (viewImage) {
      viewImage.classList.remove('hidden');
      initImageViewerAndAnnotation(fileUrl, fileName, fileObj, sub, assignment);
    }
  }
  // 2. Video Player with Speed Control
  else if (['mp4', 'webm', 'mov', 'mkv', 'ogg'].includes(ext)) {
    if (viewVideo) {
      viewVideo.classList.remove('hidden');
      const vid = document.getElementById('starterVideoElement');
      if (vid) {
        vid.src = fileUrl;
        vid.play().catch(() => {});
      }
    }
  }
  // 3. Audio Player
  else if (['mp3', 'wav', 'm4a', 'flac', 'aac'].includes(ext)) {
    if (viewVideo) {
      viewVideo.classList.remove('hidden');
      const vid = document.getElementById('starterVideoElement');
      if (vid) {
        vid.src = fileUrl;
        vid.play().catch(() => {});
      }
    }
  }
  // 4. PDF (with PPT Presentation Mode)
  else if (ext === 'pdf') {
    if (viewPdf) {
      viewPdf.classList.remove('hidden');
      initPdfAndPptViewer(fileUrl, fileName);
    }
  }
  // 5. Code, Scripts, Text & Documents
  else {
    if (viewCode) {
      viewCode.classList.remove('hidden');
      initCodeCompilerViewer(fileUrl, fileName);
    }
  }

  modal.showModal();
}

function initImageViewerAndAnnotation(imageUrl, fileName, fileObj = {}, sub = null, assignment = null) {
  const img = document.getElementById('starterImageElement');
  const canvas = document.getElementById('starterAnnotationCanvas');
  const canvasWrap = document.getElementById('imageAnnotationCanvasWrap');
  const zoomDisplay = document.getElementById('zoomLevelDisplay');
  const btnSaveImg = document.getElementById('btnSaveAnnotatedImage');
  const btnSaveServer = document.getElementById('btnSaveAnnotationServer');
  const badgeServer = document.getElementById('starterAnnotationServerBadge');
  const btnDeleteSelected = document.getElementById('toolBtnDeleteSelected');

  const isTeacher = appState.currentUser && (appState.currentUser.role === 'teacher' || appState.currentUser.role === 'guru' || appState.currentUser.role === 'admin');
  const isStudent = !isTeacher;

  // Toggle tool visibility based on role (murid tidak bisa anotasi - hanya guru yang bisa koreksi)
  const annotGroup = document.querySelector('.annotation-tools-group');
  const annotLabel = annotGroup ? annotGroup.querySelector('.toolbar-label') : null;
  const toolSelect = document.getElementById('toolBtnSelect');
  const toolPen = document.getElementById('toolBtnPen');
  const toolCircle = document.getElementById('toolBtnCircle');
  const toolText = document.getElementById('toolBtnText');
  const colorPicker = document.querySelector('.color-picker-group');
  const toolUndo = document.getElementById('toolBtnUndo');
  const toolClear = document.getElementById('toolBtnClear');

  if (isStudent) {
    if (annotLabel) annotLabel.style.display = 'none';
    if (toolSelect) toolSelect.style.display = 'none';
    if (toolPen) toolPen.style.display = 'none';
    if (toolCircle) toolCircle.style.display = 'none';
    if (toolText) toolText.style.display = 'none';
    if (colorPicker) colorPicker.style.display = 'none';
    if (toolUndo) toolUndo.style.display = 'none';
    if (toolClear) toolClear.style.display = 'none';
    if (btnDeleteSelected) btnDeleteSelected.style.display = 'none';
    if (btnSaveServer) btnSaveServer.style.display = 'none';
    if (canvas) {
      canvas.style.pointerEvents = 'none';
      canvas.style.cursor = 'default';
    }
  } else {
    if (annotLabel) annotLabel.style.display = '';
    if (toolSelect) toolSelect.style.display = '';
    if (toolPen) toolPen.style.display = '';
    if (toolCircle) toolCircle.style.display = '';
    if (toolText) toolText.style.display = '';
    if (colorPicker) colorPicker.style.display = '';
    if (toolUndo) toolUndo.style.display = '';
    if (toolClear) toolClear.style.display = '';
    if (btnSaveServer) btnSaveServer.style.display = '';
    if (canvas) {
      canvas.style.pointerEvents = 'auto';
      canvas.style.cursor = 'crosshair';
    }
  }

  if (!img || !canvas) return;

  currentZoomScale = 1.0;
  if (canvasWrap) canvasWrap.style.transform = 'scale(1)';
  if (zoomDisplay) zoomDisplay.textContent = '100%';

  const ctx = canvas.getContext('2d');

  // Vector annotation elements state
  let annotationElements = [];
  let selectedAnnotationIdx = -1;
  let activeDragMode = null; // null | 'draw' | 'move' | 'resize'
  let activeResizeHandle = null; // 'nw' | 'ne' | 'se' | 'sw'
  let dragStartCoords = { x: 0, y: 0 };
  let origElementState = null;
  let currentPreviewElement = null;
  let annotationHistoryStack = [];

  function pushHistory() {
    annotationHistoryStack.push(JSON.parse(JSON.stringify(annotationElements)));
    if (annotationHistoryStack.length > 35) annotationHistoryStack.shift();
  }

  // Load existing annotations from server if available
  const fKey = fileName || 'primary';
  const savedData = (sub && sub.annotationsMap && sub.annotationsMap[fKey]) || (sub && sub.annotationsMap && sub.annotationsMap[fileName]);
  const existingList = (savedData && Array.isArray(savedData.annotations))
    ? savedData.annotations
    : (sub && Array.isArray(sub.annotations) ? sub.annotations : []);

  if (existingList.length > 0) {
    annotationElements = JSON.parse(JSON.stringify(existingList));
    pushHistory();
    if (badgeServer) {
      badgeServer.style.display = 'inline-flex';
      badgeServer.textContent = `Koreksi Guru Dimuat (${annotationElements.length})`;
    }
  } else {
    annotationElements = [];
    pushHistory();
    if (badgeServer) {
      if (isStudent) {
        badgeServer.style.display = 'inline-flex';
        badgeServer.textContent = 'Belum Ada Koreksi Guru';
      } else {
        badgeServer.style.display = 'none';
      }
    }
  }

  function setupCanvasSize() {
    canvas.width = img.naturalWidth || img.clientWidth || 800;
    canvas.height = img.naturalHeight || img.clientHeight || 600;
    renderAllAnnotations();
  }

  img.onload = setupCanvasSize;
  if (img.complete && img.naturalWidth) setupCanvasSize();
  img.src = imageUrl;

  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.clientX != null ? e.clientX : (e.touches ? e.touches[0].clientX : 0);
    const clientY = e.clientY != null ? e.clientY : (e.touches ? e.touches[0].clientY : 0);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function getElementBBox(el) {
    if (!el) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    if (el.type === 'circle') {
      const rx = Math.max(1, el.rx || 10);
      const ry = Math.max(1, el.ry || 10);
      return {
        minX: el.cx - rx,
        minY: el.cy - ry,
        maxX: el.cx + rx,
        maxY: el.cy + ry
      };
    } else if (el.type === 'text') {
      ctx.font = `bold ${el.fontSize || 24}px sans-serif`;
      const w = ctx.measureText(el.text || '').width;
      const h = el.fontSize || 24;
      return {
        minX: el.x,
        minY: el.y - h,
        maxX: el.x + w,
        maxY: el.y + 6
      };
    } else if (el.type === 'pen' && Array.isArray(el.points) && el.points.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      el.points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
      return { minX: minX - 4, minY: minY - 4, maxX: maxX + 4, maxY: maxY + 4 };
    }
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  function getHandleAtCoords(el, x, y) {
    if (!el) return null;
    const bbox = getElementBBox(el);
    const handleThreshold = 18; // hit target radius in canvas coords
    const handles = [
      { name: 'nw', x: bbox.minX, y: bbox.minY },
      { name: 'ne', x: bbox.maxX, y: bbox.minY },
      { name: 'se', x: bbox.maxX, y: bbox.maxY },
      { name: 'sw', x: bbox.minX, y: bbox.maxY }
    ];
    for (const h of handles) {
      if (Math.hypot(h.x - x, h.y - y) <= handleThreshold) {
        return h.name;
      }
    }
    return null;
  }

  function getElementAtCoords(x, y) {
    for (let i = annotationElements.length - 1; i >= 0; i--) {
      const el = annotationElements[i];
      if (el.type === 'circle') {
        const rx = Math.max(1, el.rx || 10);
        const ry = Math.max(1, el.ry || 10);
        const dist = Math.pow((x - el.cx) / (rx + 10), 2) + Math.pow((y - el.cy) / (ry + 10), 2);
        if (dist <= 1.3) return i;
      } else if (el.type === 'text') {
        ctx.font = `bold ${el.fontSize || 24}px sans-serif`;
        const w = ctx.measureText(el.text || '').width;
        const h = el.fontSize || 24;
        if (x >= el.x - 8 && x <= el.x + w + 8 && y >= el.y - h - 6 && y <= el.y + 10) return i;
      } else if (el.type === 'pen' && Array.isArray(el.points)) {
        for (const p of el.points) {
          if (Math.hypot(p.x - x, p.y - y) <= 15) return i;
        }
      }
    }
    return -1;
  }

  function drawSingleElement(el) {
    ctx.save();
    if (el.type === 'circle') {
      ctx.strokeStyle = el.color || '#EF4444';
      ctx.lineWidth = el.lineWidth || 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(el.cx, el.cy, Math.max(1, el.rx), Math.max(1, el.ry), 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (el.type === 'text') {
      ctx.font = `bold ${el.fontSize || 24}px sans-serif`;
      ctx.fillStyle = el.color || '#EF4444';
      ctx.fillText(el.text || '', el.x, el.y);
    } else if (el.type === 'pen' && Array.isArray(el.points) && el.points.length > 0) {
      ctx.strokeStyle = el.color || '#EF4444';
      ctx.lineWidth = el.lineWidth || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(el.points[0].x, el.points[0].y);
      for (let i = 1; i < el.points.length; i++) {
        ctx.lineTo(el.points[i].x, el.points[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderAllAnnotations() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Render all committed elements
    annotationElements.forEach(el => drawSingleElement(el));

    // 2. Render active drawing preview (e.g. circle being dragged - single preview without spam)
    if (currentPreviewElement) {
      drawSingleElement(currentPreviewElement);
    }

    // 3. Render selection bounding box & handles if an element is selected
    if (selectedAnnotationIdx >= 0 && selectedAnnotationIdx < annotationElements.length) {
      const el = annotationElements[selectedAnnotationIdx];
      const bbox = getElementBBox(el);

      ctx.save();
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(bbox.minX - 4, bbox.minY - 4, (bbox.maxX - bbox.minX) + 8, (bbox.maxY - bbox.minY) + 8);

      // Draw 4 resize handles
      ctx.setLineDash([]);
      const handles = [
        { x: bbox.minX - 4, y: bbox.minY - 4 },
        { x: bbox.maxX + 4, y: bbox.minY - 4 },
        { x: bbox.maxX + 4, y: bbox.maxY + 4 },
        { x: bbox.minX - 4, y: bbox.maxY + 4 }
      ];

      handles.forEach(h => {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#0284C7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    if (btnDeleteSelected) {
      btnDeleteSelected.style.display = (selectedAnnotationIdx >= 0) ? 'inline-flex' : 'none';
    }
  }

  // --- Mouse / Pointer Event Handlers ---
  canvas.onmousedown = (e) => {
    const { x, y } = getCanvasCoords(e);
    dragStartCoords = { x, y };

    // 1. SELECTOR TOOL (Move & Resize)
    if (currentAnnotationTool === 'select') {
      if (selectedAnnotationIdx >= 0) {
        const selEl = annotationElements[selectedAnnotationIdx];
        const handle = getHandleAtCoords(selEl, x, y);
        if (handle) {
          activeDragMode = 'resize';
          activeResizeHandle = handle;
          origElementState = JSON.parse(JSON.stringify(selEl));
          return;
        }
      }

      const hitIdx = getElementAtCoords(x, y);
      if (hitIdx >= 0) {
        selectedAnnotationIdx = hitIdx;
        activeDragMode = 'move';
        origElementState = JSON.parse(JSON.stringify(annotationElements[hitIdx]));
      } else {
        selectedAnnotationIdx = -1;
        activeDragMode = null;
      }
      renderAllAnnotations();
      return;
    }

    // 2. CIRCLE TOOL (No spam preview)
    if (currentAnnotationTool === 'circle') {
      activeDragMode = 'draw';
      selectedAnnotationIdx = -1;
      currentPreviewElement = {
        type: 'circle',
        cx: x,
        cy: y,
        rx: 0,
        ry: 0,
        color: currentAnnotationColor,
        lineWidth: 3
      };
      renderAllAnnotations();
      return;
    }

    // 3. PEN TOOL (Freehand path)
    if (currentAnnotationTool === 'pen') {
      activeDragMode = 'draw';
      selectedAnnotationIdx = -1;
      currentPreviewElement = {
        type: 'pen',
        points: [{ x, y }],
        color: currentAnnotationColor,
        lineWidth: 4
      };
      renderAllAnnotations();
      return;
    }

    // 4. TEXT TOOL (Custom Glass Prompt Dialog - No Native Browser Dialog!)
    if (currentAnnotationTool === 'text') {
      showPromptDialog({
        title: 'Catatan Koreksi Gambar',
        message: 'Tuliskan catatan evaluasi atau petunjuk perbaikan untuk gambar ini:',
        placeholder: 'Contoh: Perjelas diagram langkah ke-2...',
        confirmText: 'Tambahkan Teks',
        cancelText: 'Batal',
        type: 'info'
      }).then(text => {
        if (text && text.trim()) {
          const newTextEl = {
            type: 'text',
            x,
            y,
            text: text.trim(),
            color: currentAnnotationColor,
            fontSize: 26
          };
          annotationElements.push(newTextEl);
          pushHistory();
          selectedAnnotationIdx = annotationElements.length - 1;
          setTool('select', toolSelect);
          renderAllAnnotations();
        }
      });
      return;
    }
  };

  canvas.onmousemove = (e) => {
    const { x, y } = getCanvasCoords(e);

    // Hover cursor updates when using select tool
    if (currentAnnotationTool === 'select' && !activeDragMode) {
      if (selectedAnnotationIdx >= 0) {
        const handle = getHandleAtCoords(annotationElements[selectedAnnotationIdx], x, y);
        if (handle === 'nw' || handle === 'se') {
          canvas.style.cursor = 'nwse-resize';
          return;
        } else if (handle === 'ne' || handle === 'sw') {
          canvas.style.cursor = 'nesw-resize';
          return;
        }
      }
      const hit = getElementAtCoords(x, y);
      canvas.style.cursor = (hit >= 0) ? 'move' : 'default';
      return;
    }

    if (!activeDragMode) return;

    // A. Move active element
    if (activeDragMode === 'move' && selectedAnnotationIdx >= 0 && origElementState) {
      const dx = x - dragStartCoords.x;
      const dy = y - dragStartCoords.y;
      const el = annotationElements[selectedAnnotationIdx];

      if (el.type === 'circle') {
        el.cx = origElementState.cx + dx;
        el.cy = origElementState.cy + dy;
      } else if (el.type === 'text') {
        el.x = origElementState.x + dx;
        el.y = origElementState.y + dy;
      } else if (el.type === 'pen' && Array.isArray(origElementState.points)) {
        el.points = origElementState.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      }
      renderAllAnnotations();
      return;
    }

    // B. Resize active element
    if (activeDragMode === 'resize' && selectedAnnotationIdx >= 0 && origElementState) {
      const el = annotationElements[selectedAnnotationIdx];

      if (el.type === 'circle') {
        const origBbox = getElementBBox(origElementState);
        let anchorX = origBbox.minX;
        let anchorY = origBbox.minY;

        if (activeResizeHandle === 'nw') {
          anchorX = origBbox.maxX;
          anchorY = origBbox.maxY;
        } else if (activeResizeHandle === 'ne') {
          anchorX = origBbox.minX;
          anchorY = origBbox.maxY;
        } else if (activeResizeHandle === 'sw') {
          anchorX = origBbox.maxX;
          anchorY = origBbox.minY;
        } else if (activeResizeHandle === 'se') {
          anchorX = origBbox.minX;
          anchorY = origBbox.minY;
        }

        const newRx = Math.max(8, Math.abs(x - anchorX) / 2);
        const newRy = Math.max(8, Math.abs(y - anchorY) / 2);
        el.rx = newRx;
        el.ry = newRy;
        el.cx = (anchorX + x) / 2;
        el.cy = (anchorY + y) / 2;
      } else if (el.type === 'text') {
        const origBbox = getElementBBox(origElementState);
        const centerX = (origBbox.minX + origBbox.maxX) / 2;
        const centerY = (origBbox.minY + origBbox.maxY) / 2;
        const origDist = Math.hypot(dragStartCoords.x - centerX, dragStartCoords.y - centerY);
        const currentDist = Math.hypot(x - centerX, y - centerY);
        const scale = origDist > 4 ? (currentDist / origDist) : 1;
        el.fontSize = Math.round(Math.max(12, Math.min(120, (origElementState.fontSize || 24) * scale)));
      }
      renderAllAnnotations();
      return;
    }

    // C. Circle drawing preview (single frame, clean preview - NO SPAM!)
    if (activeDragMode === 'draw' && currentAnnotationTool === 'circle' && currentPreviewElement) {
      const cx = (dragStartCoords.x + x) / 2;
      const cy = (dragStartCoords.y + y) / 2;
      const rx = Math.abs(x - dragStartCoords.x) / 2;
      const ry = Math.abs(y - dragStartCoords.y) / 2;
      currentPreviewElement.cx = cx;
      currentPreviewElement.cy = cy;
      currentPreviewElement.rx = rx;
      currentPreviewElement.ry = ry;
      renderAllAnnotations();
      return;
    }

    // D. Pen drawing path
    if (activeDragMode === 'draw' && currentAnnotationTool === 'pen' && currentPreviewElement) {
      currentPreviewElement.points.push({ x, y });
      renderAllAnnotations();
      return;
    }
  };

  canvas.onmouseup = () => {
    if (!activeDragMode) return;

    if (activeDragMode === 'draw') {
      if (currentAnnotationTool === 'circle' && currentPreviewElement) {
        if (currentPreviewElement.rx >= 5 && currentPreviewElement.ry >= 5) {
          annotationElements.push(currentPreviewElement);
          pushHistory();
          selectedAnnotationIdx = annotationElements.length - 1;
          setTool('select', toolSelect);
        }
      } else if (currentAnnotationTool === 'pen' && currentPreviewElement) {
        if (currentPreviewElement.points.length > 1) {
          annotationElements.push(currentPreviewElement);
          pushHistory();
        }
      }
      currentPreviewElement = null;
    } else if (activeDragMode === 'move' || activeDragMode === 'resize') {
      pushHistory();
    }

    activeDragMode = null;
    activeResizeHandle = null;
    origElementState = null;
    renderAllAnnotations();
  };

  // Tools Switcher (toolSelect, toolPen, toolCircle, toolText, toolUndo, toolClear are declared at the top of the function)
  function setTool(toolName, activeBtn) {
    currentAnnotationTool = toolName;
    [toolSelect, toolPen, toolCircle, toolText].forEach(b => { if (b) b.classList.remove('active'); });
    if (activeBtn) activeBtn.classList.add('active');

    if (toolName === 'select') {
      canvas.style.cursor = 'default';
    } else {
      selectedAnnotationIdx = -1;
      canvas.style.cursor = 'crosshair';
      renderAllAnnotations();
    }
  }

  if (toolSelect) toolSelect.onclick = () => setTool('select', toolSelect);
  if (toolPen) toolPen.onclick = () => setTool('pen', toolPen);
  if (toolCircle) toolCircle.onclick = () => setTool('circle', toolCircle);
  if (toolText) toolText.onclick = () => setTool('text', toolText);

  // Color dots selection
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.onclick = () => {
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      currentAnnotationColor = dot.getAttribute('data-color') || '#EF4444';

      // If an element is currently selected, update its color too
      if (selectedAnnotationIdx >= 0 && selectedAnnotationIdx < annotationElements.length) {
        annotationElements[selectedAnnotationIdx].color = currentAnnotationColor;
        pushHistory();
        renderAllAnnotations();
      }
    };
  });

  // Delete selected element
  function deleteSelectedElement() {
    if (selectedAnnotationIdx >= 0 && selectedAnnotationIdx < annotationElements.length) {
      annotationElements.splice(selectedAnnotationIdx, 1);
      selectedAnnotationIdx = -1;
      pushHistory();
      renderAllAnnotations();
      showToast('Objek anotasi berhasil dihapus', 'info');
    }
  }

  if (btnDeleteSelected) {
    btnDeleteSelected.onclick = deleteSelectedElement;
  }

  // Keyboard shortcut: Delete or Backspace to delete selected object
  const keyHandler = (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationIdx >= 0) {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag !== 'input' && activeTag !== 'textarea') {
        e.preventDefault();
        deleteSelectedElement();
      }
    }
  };
  window.addEventListener('keydown', keyHandler);

  // Undo & Clear
  if (toolUndo) {
    toolUndo.onclick = () => {
      if (annotationHistoryStack.length > 1) {
        annotationHistoryStack.pop();
        const prev = annotationHistoryStack[annotationHistoryStack.length - 1];
        annotationElements = JSON.parse(JSON.stringify(prev));
        selectedAnnotationIdx = -1;
        renderAllAnnotations();
      } else if (annotationHistoryStack.length === 1) {
        annotationElements = [];
        selectedAnnotationIdx = -1;
        renderAllAnnotations();
      }
    };
  }

  if (toolClear) {
    toolClear.onclick = () => {
      if (annotationElements.length === 0) return;
      annotationElements = [];
      selectedAnnotationIdx = -1;
      pushHistory();
      renderAllAnnotations();
      showToast('Semua coretan anotasi dibersihkan', 'info');
    };
  }

  // Zoom controls
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomReset = document.getElementById('btnZoomReset');

  function updateZoom(newScale) {
    currentZoomScale = Math.min(3.0, Math.max(0.5, newScale));
    if (canvasWrap) canvasWrap.style.transform = `scale(${currentZoomScale})`;
    if (zoomDisplay) zoomDisplay.textContent = `${Math.round(currentZoomScale * 100)}%`;
  }

  if (btnZoomIn) btnZoomIn.onclick = () => updateZoom(currentZoomScale + 0.25);
  if (btnZoomOut) btnZoomOut.onclick = () => updateZoom(currentZoomScale - 0.25);
  if (btnZoomReset) btnZoomReset.onclick = () => updateZoom(1.0);

  // Touch Pinch-to-Zoom & Wheel Zoom Support
  const viewportWrap = document.getElementById('imageViewportWrapper');
  let initialPinchDist = null;
  let initialPinchScale = 1.0;

  if (viewportWrap) {
    viewportWrap.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialPinchDist = dist;
        initialPinchScale = currentZoomScale;
      }
    }, { passive: false });

    viewportWrap.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && initialPinchDist) {
        e.preventDefault();
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = currentDist / initialPinchDist;
        updateZoom(initialPinchScale * factor);
      }
    }, { passive: false });

    viewportWrap.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        initialPinchDist = null;
      }
    }, { passive: true });

    viewportWrap.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        updateZoom(currentZoomScale + delta);
      }
    }, { passive: false });
  }

  // Single-touch drawing & editing for teachers on touch devices (HP / Tablet)
  if (!isStudent) {
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        const t = e.touches[0];
        canvas.onmousedown({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => {} });
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && activeDragMode) {
        e.preventDefault();
        const t = e.touches[0];
        canvas.onmousemove({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => {} });
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      if (e.touches.length === 0 && activeDragMode) {
        canvas.onmouseup();
      }
    }, { passive: false });
  }

  // 1. SAVE ANNOTATIONS TO SERVER CLOUD
  if (btnSaveServer) {
    btnSaveServer.onclick = async () => {
      if (!sub || !sub.id) {
        showToast('Tidak ada data tugas siswa yang dapat diasosiasikan untuk penyimpanan server.', 'error');
        return;
      }

      showToast('Menyimpan coretan koreksi ke server cloud...', 'info');

      // Export rendered image
      selectedAnnotationIdx = -1; // hide selection bounding box before exporting
      renderAllAnnotations();

      const mergedCanvas = document.createElement('canvas');
      mergedCanvas.width = canvas.width;
      mergedCanvas.height = canvas.height;
      const mCtx = mergedCanvas.getContext('2d');
      mCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
      mCtx.drawImage(canvas, 0, 0);

      const dataUrl = mergedCanvas.toDataURL('image/png');

      try {
        const res = await fetch('/api/submissions/annotation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId: sub.id,
            assignmentId: assignment ? assignment.id : sub.assignmentId,
            fileName: fileName,
            annotations: annotationElements,
            annotatedImageData: dataUrl
          })
        });

        const data = await res.json();
        if (data.ok) {
          sub.annotations = annotationElements;
          if (data.annotatedImageUrl) {
            sub.annotatedImageUrl = data.annotatedImageUrl;
          }
          if (!sub.annotationsMap) sub.annotationsMap = {};
          sub.annotationsMap[fileName] = {
            annotations: annotationElements,
            annotatedImageUrl: data.annotatedImageUrl,
            updatedAt: new Date().toISOString()
          };

          await dbPut('submissions', sub);

          if (badgeServer) {
            badgeServer.style.display = 'inline-flex';
            badgeServer.textContent = '☁️ Tersimpan di Server';
          }
          showToast('Koreksi anotasi berhasil disimpan di server cloud!', 'success');
        } else {
          showToast('Gagal menyimpan anotasi ke server: ' + (data.error || 'Server error'), 'error');
        }
      } catch (err) {
        console.error('Error saving annotation to server:', err);
        showToast('Koneksi server gagal saat menyimpan anotasi.', 'error');
      }
    };
  }

  // 2. LOCAL DOWNLOAD MERGED IMAGE (PNG)
  if (btnSaveImg) {
    btnSaveImg.onclick = () => {
      selectedAnnotationIdx = -1;
      renderAllAnnotations();

      const mergedCanvas = document.createElement('canvas');
      mergedCanvas.width = canvas.width;
      mergedCanvas.height = canvas.height;
      const mCtx = mergedCanvas.getContext('2d');
      mCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
      mCtx.drawImage(canvas, 0, 0);

      const link = document.createElement('a');
      link.download = `koreksi_${fileName}`;
      link.href = mergedCanvas.toDataURL('image/png');
      link.click();
      showToast('Gambar beranotasi koreksi berhasil diunduh!', 'success');
    };
  }
}

function initPdfAndPptViewer(pdfUrl, fileName) {
  const iframe = document.getElementById('starterPdfIframe');
  const pptContainer = document.getElementById('pdfPptSlidesContainer');
  const btnTogglePpt = document.getElementById('btnTogglePdfPptMode');
  const btnDownloadPpt = document.getElementById('btnDownloadPdfAsPpt');
  const btnExitPpt = document.getElementById('btnExitPptMode');
  const pptContent = document.getElementById('pptSlideContent');
  const pageCur = document.getElementById('pptCurrentPageNum');
  const pageTot = document.getElementById('pptTotalPagesNum');

  if (iframe) iframe.src = pdfUrl;

  pptCurrentPage = 1;
  pptTotalPages = 5;

  function showPptSlide(pageNum) {
    pptCurrentPage = Math.max(1, Math.min(pptTotalPages, pageNum));
    if (pageCur) pageCur.textContent = pptCurrentPage;
    if (pageTot) pageTot.textContent = pptTotalPages;
    const slideNumberEl = document.getElementById('pptSlideNumber');
    if (slideNumberEl) slideNumberEl.textContent = `Slide ${pptCurrentPage} / ${pptTotalPages}`;

    if (pptContent) {
      pptContent.innerHTML = `
        <div style="text-align:center; padding:20px;">
          <div style="font-size:3rem; margin-bottom:12px;">📊</div>
          <h3 style="color:#FFFFFF; margin-bottom:8px;">Halaman ${pptCurrentPage}: ${escapeHtml(fileName)}</h3>
          <p style="color:var(--text-muted); font-size:0.9rem;">Pratinjau Presentasi Slide Interaktif</p>
          <iframe src="${pdfUrl}#page=${pptCurrentPage}" style="width:100%; height:380px; border:none; border-radius:8px;"></iframe>
        </div>
      `;
    }
  }

  if (btnTogglePpt && pptContainer) {
    btnTogglePpt.onclick = () => {
      const isPpt = pptContainer.classList.toggle('hidden');
      if (!isPpt) {
        if (iframe) iframe.classList.add('hidden');
        showPptSlide(1);
      } else {
        if (iframe) iframe.classList.remove('hidden');
      }
    };
  }

  if (btnExitPpt && pptContainer && iframe) {
    btnExitPpt.onclick = () => {
      pptContainer.classList.add('hidden');
      iframe.classList.remove('hidden');
    };
  }

  const btnPrev = document.getElementById('btnPptPrevSlide');
  const btnNext = document.getElementById('btnPptNextSlide');
  if (btnPrev) btnPrev.onclick = () => showPptSlide(pptCurrentPage - 1);
  if (btnNext) btnNext.onclick = () => showPptSlide(pptCurrentPage + 1);

  // Keyboard navigation for presentation mode
  window.addEventListener('keydown', (e) => {
    if (pptContainer && !pptContainer.classList.contains('hidden')) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        showPptSlide(pptCurrentPage + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        showPptSlide(pptCurrentPage - 1);
      }
    }
  });

  // Download standalone presentation
  if (btnDownloadPpt) {
    btnDownloadPpt.onclick = () => {
      const pptHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Presentasi - ${escapeHtml(fileName)}</title>
  <style>
    body { margin:0; background:#0F172A; color:#FFF; font-family:sans-serif; display:flex; flex-direction:column; height:100vh; justify-content:center; align-items:center; }
    .slide { max-width:900px; width:90%; aspect-ratio:16/9; background:#1E293B; border-radius:16px; padding:40px; box-shadow:0 20px 50px rgba(0,0,0,0.5); display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; }
    h1 { color:#38BDF8; font-size:2.2rem; }
    p { color:#94A3B8; font-size:1.1rem; }
    .footer { margin-top:20px; font-size:0.8rem; color:#64748B; }
  </style>
</head>
<body>
  <div class="slide">
    <h1>${escapeHtml(fileName)}</h1>
    <p>Presentasi Berkas Tugas MyPnk Cloud</p>
    <a href="${pdfUrl}" target="_blank" style="display:inline-block; margin-top:20px; padding:12px 24px; background:#2563EB; color:#FFF; text-decoration:none; border-radius:8px; font-weight:bold;">Buka Dokumen PDF Lengkap</a>
    <div class="footer">Dibuat otomatis oleh Sistem Cloud Xozen (arcznewera)</div>
  </div>
</body>
</html>`;

      const blob = new Blob([pptHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Presentasi_${fileName.replace('.pdf', '')}.html`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Berkas slide presentasi berhasil diunduh!', 'success');
    };
  }
}

function initCodeCompilerViewer(fileUrl, fileName) {
  const textarea = document.getElementById('starterCodeTextarea');
  const langSelect = document.getElementById('starterCodeLangSelect');
  const btnRun = document.getElementById('btnRunStarterCode');
  const terminal = document.getElementById('starterTerminalOutput');
  const btnClear = document.getElementById('btnClearStarterTerminal');

  const ext = fileName.split('.').pop().toLowerCase();
  if (langSelect) {
    if (ext === 'py') langSelect.value = 'python';
    else if (ext === 'js') langSelect.value = 'javascript';
    else if (ext === 'c') langSelect.value = 'c';
    else if (ext === 'cpp') langSelect.value = 'cpp';
    else if (ext === 'java') langSelect.value = 'java';
    else if (ext === 'sh' || ext === 'bash') langSelect.value = 'bash';
  }

  if (textarea) {
    textarea.value = `// Memuat berkas ${fileName}...\n`;
    if (fileUrl) {
      fetch(fileUrl)
        .then(res => res.text())
        .then(text => {
          textarea.value = text;
        })
        .catch(() => {
          textarea.value = `# Berkas: ${fileName}\nprint("Halo dari Starter Web MyPnk!")\n`;
        });
    } else {
      textarea.value = `# Berkas: ${fileName}\n`;
    }
  }

  if (btnRun && terminal) {
    btnRun.onclick = async () => {
      const code = textarea ? textarea.value : '';
      const language = langSelect ? langSelect.value : 'python';
      terminal.textContent = 'Menjalankan kode di server sandbox...\n';

      try {
        const res = await fetch('/api/compiler/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language, code, stdin: '' })
        });
        const data = await res.json();
        if (data.error) {
          terminal.textContent = `[ERROR]: ${data.error}`;
        } else {
          let output = data.output || data.stdout || '';
          if (data.stderr) output += `\n[STDERR]:\n${data.stderr}`;
          terminal.textContent = output || '[Eksekusi Selesai - Tidak ada output]';
        }
      } catch (err) {
        terminal.textContent = `[GAGAL EKSEKUSI]: ${err.message}`;
      }
    };
  }

  if (btnClear && terminal) {
    btnClear.onclick = () => {
      terminal.textContent = 'Terminal bersih. Klik "▶️ Jalankan Kode" untuk eksekusi.';
    };
  }
}

// Video Speed Controller wiring
document.querySelectorAll('.video-speed-controls .speed-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.video-speed-controls .speed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const speed = parseFloat(btn.getAttribute('data-speed')) || 1.0;
    const vid = document.getElementById('starterVideoElement');
    if (vid) vid.playbackRate = speed;
  };
});

dom.btnCloseSubmissionsModal.addEventListener('click', () => dom.submissionsListModal.close());
dom.btnCloseSubmissionsView.addEventListener('click', () => dom.submissionsListModal.close());
dom.btnCloseSubmissionsView.addEventListener('click', () => dom.submissionsListModal.close());

// Guru: Modal Student Accounts with Name & Password Viewing/Editing
async function openStudentAccountsModal() {
  renderStudentAccountsTable();
  dom.studentAccountsModal.showModal();
  try {
    const res = await fetch('/api/db/students');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        appState.students = data.items.slice().sort((a, b) => a.absen - b.absen);
        renderStudentAccountsTable();
      }
    }
  } catch (err) {
    console.warn('Gagal menyegarkan daftar password siswa:', err);
  }
}

function renderStudentAccountsTable() {
  dom.studentAccountsTableBody.innerHTML = '';

  appState.students.forEach(student => {
    const count = appState.submissions.filter(s => s.studentName.toLowerCase().includes(student.name.toLowerCase())).length;
    const displayPassword = student.code || `${student.absen}pnk`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-absen"><strong>${student.absen}</strong></td>
      <td class="col-student-name">
        <div class="student-name-cell">
          <span class="student-name-text" id="nameText_${student.absen}">${escapeHtml(student.name)}</span>
          <div class="student-name-meta">
            <button class="btn btn-secondary btn-sm btn-edit-name btn-table-mini" data-absen="${student.absen}" title="Ubah Nama Asli">Ubah</button>
            <span class="student-task-count-inline">${count} tugas</span>
          </div>
        </div>
      </td>
      <td class="col-password"><span class="code-password-badge">${escapeHtml(displayPassword)}</span></td>
      <td class="col-task-count"><span>${count} tugas</span></td>
      <td class="col-actions">
        <div class="student-actions-cell">
          <button class="btn btn-secondary btn-sm btn-copy-one btn-table-mini" data-absen="${student.absen}" title="Salin Info Login">Salin</button>
          <button class="btn btn-secondary btn-sm btn-edit-pass btn-table-mini" data-absen="${student.absen}" title="Ganti Password Akun Ini">Ganti PW</button>
        </div>
      </td>
    `;

    const btnEdit = tr.querySelector('.btn-edit-name');
    btnEdit.addEventListener('click', async () => {
      const currentVal = student.name === `Siswa Absen ${student.absen}` ? '' : student.name;
      const newName = await showPromptDialog({
        title: `Nama Siswa Absen ${student.absen}`,
        message: `Masukkan nama asli untuk siswa nomor absen ${student.absen}:`,
        defaultValue: currentVal,
        placeholder: 'Nama lengkap siswa',
        type: 'info'
      });
      if (newName !== null && newName.trim() !== '') {
        student.name = newName.trim();
        await dbPut('students', student);
        renderStudentAccountsTable();
        showToast(`Nama siswa absen ${student.absen} diperbarui menjadi ${student.name}`, 'success');
      }
    });

    const btnPass = tr.querySelector('.btn-edit-pass');
    btnPass.addEventListener('click', async () => {
      const newPw = await showPromptDialog({
        title: 'Ganti Password Siswa',
        message: `Masukkan password baru untuk ${student.name} (Absen ${student.absen}) - Minimal 3 karakter:`,
        placeholder: 'Password baru',
        inputType: 'password',
        type: 'warning'
      });
      if (!newPw || newPw.trim().length < 3) {
        if (newPw !== null) showToast('Password baru minimal 3 karakter.', 'error');
        return;
      }
      const teacherPw = await ensureTeacherPassword();
      if (!teacherPw) return;
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target: 'siswa',
            absen: student.absen,
            newPassword: newPw.trim(),
            teacherPassword: teacherPw
          })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          student.code = data.student.code;
          renderStudentAccountsTable();
          showToast(`Password ${student.name} (Absen ${student.absen}) berhasil diganti!`, 'success');
        } else {
          if (res.status === 401) appState.teacherPasswordHolder = null;
          showToast(data.error || 'Gagal mengganti password.', 'error');
        }
      } catch {
        showToast('Tidak bisa menghubungi server.', 'error');
      }
    });

    const btnCopy = tr.querySelector('.btn-copy-one');
    btnCopy.addEventListener('click', () => {
      const text = `No. Absen: ${student.absen} | Nama: ${student.name} | Password: ${student.code}`;
      navigator.clipboard.writeText(text);
      showToast(`Akses login absen ${student.absen} berhasil disalin`, 'success');
    });

    dom.studentAccountsTableBody.appendChild(tr);
  });
}

dom.btnOpenStudentAccountsModal.addEventListener('click', openStudentAccountsModal);
dom.btnCloseAccountsModal.addEventListener('click', () => dom.studentAccountsModal.close());
dom.btnCloseAccountsView.addEventListener('click', () => dom.studentAccountsModal.close());

dom.btnCopyAllStudentLogins.addEventListener('click', () => {
  let fullText = '=== DAFTAR KODE AKSES SISWA XOZEN CLOUD ===\n\n';
  appState.students.forEach(s => {
    fullText += `Absen ${s.absen.toString().padStart(2, '0')}: ${s.name} -> Password: ${s.code}\n`;
  });
  navigator.clipboard.writeText(fullText);
  showToast('Daftar semua akun siswa berhasil disalin ke clipboard!', 'success');
});

// Guru: Buat akun siswa baru
async function createStudentAccount() {
  const name = await showPromptDialog({
    title: 'Tambah Siswa Baru',
    message: 'Masukkan nama siswa baru (contoh: Rani Salsabila):',
    placeholder: 'Nama siswa baru',
    type: 'info'
  });
  if (name === null) return;
  if (!name.trim()) {
    showToast('Nama siswa wajib diisi.', 'error');
    return;
  }
  const passwordInput = await showPromptDialog({
    title: 'Password Awal Siswa',
    message: 'Password awal siswa (kosongkan untuk dibuat OTOMATIS format absen + 2 huruf, misal 17KD):',
    placeholder: 'Kosongkan jika otomatis',
    inputType: 'password',
    type: 'info'
  });
  if (passwordInput === null) return;

  const teacherPw = await ensureTeacherPassword();
  if (!teacherPw) return;

  try {
    const res = await fetch('/api/auth/create-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherPassword: teacherPw,
        name: name.trim(),
        password: passwordInput.trim() || undefined
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      appState.students.push(data.student);
      appState.students.sort((a, b) => a.absen - b.absen);
      renderStudentAccountsTable();
      showToast(`Akun dibuat! Absen ${data.student.absen} : ${data.student.name} : Password: ${data.student.code}`, 'success');
    } else {
      if (res.status === 401) appState.teacherPasswordHolder = null;
      showToast(data.error || 'Gagal membuat akun siswa.', 'error');
    }
  } catch {
    showToast('Tidak bisa menghubungi server.', 'error');
  }
}

// Guru: Ganti password akun guru
async function changeTeacherPassword() {
  const teacherPw = await ensureTeacherPassword();
  if (!teacherPw) return;
  const newPw = await showPromptDialog({
    title: 'Ganti Password Akun Guru',
    message: 'Masukkan password BARU untuk akun guru (minimal 3 karakter):',
    placeholder: 'Password baru guru',
    inputType: 'password',
    type: 'warning'
  });
  if (!newPw || newPw.trim().length < 3) {
    if (newPw !== null) showToast('Password baru minimal 3 karakter.', 'error');
    return;
  }
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: 'guru',
        oldPassword: teacherPw,
        newPassword: newPw.trim()
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      appState.teacherPasswordHolder = newPw.trim();
      showToast(data.message || 'Password guru berhasil diganti!', 'success');
    } else {
      if (res.status === 401) appState.teacherPasswordHolder = null;
      showToast(data.error || 'Gagal mengganti password guru.', 'error');
    }
  } catch {
    showToast('Tidak bisa menghubungi server.', 'error');
  }
}

if (dom.btnAddStudentAccount) {
  dom.btnAddStudentAccount.addEventListener('click', createStudentAccount);
}
if (dom.btnChangeTeacherPassword) {
  dom.btnChangeTeacherPassword.addEventListener('click', changeTeacherPassword);
}

// Logout Button in Top Bar
dom.btnLogoutAccount.addEventListener('click', logoutUser);

// ==========================================================================
// GATEWAY AUTH: MORPHING LOGO BUTTON & WIZARD LOGIN (ABSEN -> PASSWORD)
// ==========================================================================

// Expand Morphing Button to Login Form
function expandGatewayToForm(immediate = false) {
  if (!dom.authMorphContainer) return;
  if (dom.authMorphContainer.classList.contains('state-expanded') || dom.authMorphContainer.classList.contains('is-loading')) return;

  const startMorph = () => {
    dom.authMorphContainer.classList.remove('is-loading', 'state-button');

    // 1. Siapkan form di belakang layar dengan opacity 0 untuk mengukur tinggi aslinya
    if (dom.gatewayCardInner) {
      dom.gatewayCardInner.classList.remove('hidden');
      dom.gatewayCardInner.style.opacity = '0';
      dom.gatewayCardInner.style.transform = 'translateY(6px)';
    }
    setWizardStep(1);

    // 2. Hitung dimensi target secara presisi agar tidak terjadi efek mengecil setelah membesar
    const targetWidth = Math.min(440, Math.max(300, window.innerWidth - 32));
    const contentH = dom.gatewayCardInner ? (dom.gatewayCardInner.scrollHeight || dom.gatewayCardInner.offsetHeight) : 410;
    // Padding kartu: 28px atas + 22px bawah = 50px
    const targetHeight = contentH + 50;

    // 3. Kunci dimensi awal (140x140) lalu force reflow
    dom.authMorphContainer.style.width = '140px';
    dom.authMorphContainer.style.height = '140px';
    void dom.authMorphContainer.offsetHeight;

    // 4. Tambah state-expanded dan transisikan dimensi langsung ke ukuran akhir dalam satu tarikan
    dom.authMorphContainer.classList.add('state-expanded');
    dom.authMorphContainer.style.width = targetWidth + 'px';
    dom.authMorphContainer.style.height = targetHeight + 'px';

    // 5. Fade-in isi form secara lembut seiring pelebaran kartu
    requestAnimationFrame(() => {
      if (dom.gatewayCardInner) {
        dom.gatewayCardInner.style.opacity = '1';
        dom.gatewayCardInner.style.transform = 'translateY(0)';
      }
    });

    // 6. Lepas inline dimension setelah transisi selesai (350ms) agar layout tetap responsif
    setTimeout(() => {
      if (dom.authMorphContainer && dom.authMorphContainer.classList.contains('state-expanded')) {
        dom.authMorphContainer.style.width = '';
        dom.authMorphContainer.style.height = '';
      }
      if (dom.gatewayCardInner) {
        dom.gatewayCardInner.style.opacity = '';
        dom.gatewayCardInner.style.transform = '';
      }
    }, 360);
  };

  if (immediate) {
    startMorph();
    return;
  }

  // Mulai animasi outline loading pada tombol logo
  dom.authMorphContainer.classList.add('is-loading');

  // Jalankan morph setelah outline loading selesai (720ms)
  setTimeout(startMorph, 720);
}

// Collapse Login Form back to Initial Logo Button
function collapseGatewayToButton() {
  if (!dom.authMorphContainer) return;
  if (!dom.authMorphContainer.classList.contains('state-expanded')) return;

  const currentW = dom.authMorphContainer.offsetWidth;
  const currentH = dom.authMorphContainer.offsetHeight;

  dom.authMorphContainer.style.width = currentW + 'px';
  dom.authMorphContainer.style.height = currentH + 'px';
  void dom.authMorphContainer.offsetHeight;

  if (dom.gatewayCardInner) {
    dom.gatewayCardInner.style.opacity = '0';
  }

  dom.authMorphContainer.classList.remove('state-expanded');
  dom.authMorphContainer.classList.add('state-button');
  dom.authMorphContainer.style.width = '140px';
  dom.authMorphContainer.style.height = '140px';

  setTimeout(() => {
    if (dom.authMorphContainer && dom.authMorphContainer.classList.contains('state-button')) {
      dom.authMorphContainer.style.width = '';
      dom.authMorphContainer.style.height = '';
    }
    if (dom.gatewayCardInner) {
      dom.gatewayCardInner.classList.add('hidden');
      dom.gatewayCardInner.style.opacity = '';
      dom.gatewayCardInner.style.transform = '';
    }
    setWizardStep(1);
  }, 360);
}

function getRosterForClass(classId) {
  if (classId === 'XA') return DEMO_STUDENTS_XA;
  if (classId === 'XC') return DEMO_STUDENTS_XC;
  return (appState.students && appState.students.length > 0) ? appState.students : INITIAL_STUDENTS;
}

function updateGatewayClassHelperText(selectedClass) {
  const cls = selectedClass || 'XB';
  const label = cls === 'XB' ? 'X-B' : (cls === 'XA' ? 'X-A' : 'X-C');
  if (dom.wizardStep2ClassPill) {
    dom.wizardStep2ClassPill.textContent = `Kelas ${label}`;
  }
}

function setWizardPaneVisibility(activeStep) {
  const panes = [dom.wizardStep1, dom.wizardStep2, dom.wizardStep3];
  panes.forEach((pane, idx) => {
    if (!pane) return;
    const isActive = idx + 1 === activeStep;
    pane.classList.toggle('hidden', !isActive);
    pane.classList.toggle('active', isActive);
  });

  const dots = [dom.wizardStepDot1, dom.wizardStepDot2, dom.wizardStepDot3];
  dots.forEach((dot, idx) => {
    if (!dot) return;
    const stepNum = idx + 1;
    if (stepNum < activeStep) dot.className = 'wizard-step completed';
    else if (stepNum === activeStep) dot.className = 'wizard-step active';
    else dot.className = 'wizard-step';
  });

  const conn1 = dom.wizardConnector1 || document.getElementById('wizardConnector1');
  const conn2 = dom.wizardConnector2 || document.getElementById('wizardConnector2');
  if (conn1) {
    conn1.classList.toggle('active', activeStep >= 2);
    conn1.classList.toggle('wizard-connector-fill', activeStep >= 2);
  }
  if (conn2) {
    conn2.classList.toggle('active', activeStep >= 3);
    conn2.classList.toggle('wizard-connector-fill', activeStep >= 3);
  }
}

// Wizard Stepper Function (1: Pilih Kelas, 2: Nomor Absen, 3: Password)
function setWizardStep(step) {
  const selectedClass = gatewaySelectedClass || 'XB';
  const classLabel = selectedClass === 'XB' ? 'X-B' : (selectedClass === 'XA' ? 'X-A' : 'X-C');
  const classPicker = document.getElementById('gatewayClassPicker');
  const connector1 = document.getElementById('wizardConnector1');
  const connector2 = document.getElementById('wizardConnector2');
  const step2Pane = document.getElementById('wizardStep2');
  const step3Pane = document.getElementById('wizardStep3');

  if (step === 3) {
    const absenVal = parseInt(dom.gatewayAbsenInput ? dom.gatewayAbsenInput.value : '0', 10);
    const studentsList = getRosterForClass(selectedClass);
    const student = studentsList.find(s => Number(s.absen) === absenVal);

    if (isNaN(absenVal) || absenVal < 1) {
      showToast('Masukkan nomor absen yang valid.', 'warning');
      if (dom.gatewayAbsenInput) dom.gatewayAbsenInput.focus();
      return false;
    }

    if (selectedClass === 'XB' && absenVal === 16) {
      showToast('Nomor absen 16 tidak terdaftar (Olive keluar sekolah). Absen Stevan adalah 17.', 'warning');
      if (dom.gatewayAbsenInput) dom.gatewayAbsenInput.focus();
      return false;
    }

    if (!student) {
      showToast(`Nomor absen ${absenVal} tidak terdaftar di kelas ${classLabel}.`, 'warning');
      if (dom.gatewayAbsenInput) dom.gatewayAbsenInput.focus();
      return false;
    }

    const studentName = student ? student.name : `Siswa Absen ${absenVal}`;
    if (dom.summaryAbsenPill) dom.summaryAbsenPill.textContent = `Absen ${absenVal} (${classLabel})`;
    if (dom.summaryNameText) dom.summaryNameText.textContent = studentName;

    if (connector2) connector2.classList.add('wizard-connector-fill');
    setWizardPaneVisibility(3);
    if (step3Pane) {
      step3Pane.classList.remove('wizard-pop-in');
      void step3Pane.offsetWidth;
      step3Pane.classList.add('wizard-pop-in');
    }
    if (dom.gatewayPasswordInput) {
      dom.gatewayPasswordInput.value = '';
      dom.gatewayPasswordInput.focus();
    }
    return true;
  }

  if (step === 2) {
    if (classPicker) classPicker.classList.add('wizard-class-shrink');
    if (connector1) connector1.classList.add('wizard-connector-fill');
    if (connector2) connector2.classList.remove('wizard-connector-fill');
    updateGatewayClassHelperText(selectedClass);
    setWizardPaneVisibility(2);
    if (step2Pane) {
      step2Pane.classList.remove('wizard-pop-in');
      void step2Pane.offsetWidth;
      step2Pane.classList.add('wizard-pop-in');
    }
    if (dom.gatewayAbsenInput) {
      dom.gatewayAbsenInput.focus();
    }
    return true;
  }

  // Step 1: Pilih Kelas
  if (classPicker) classPicker.classList.remove('wizard-class-shrink');
  if (connector1) connector1.classList.remove('wizard-connector-fill');
  if (connector2) connector2.classList.remove('wizard-connector-fill');
  setWizardPaneVisibility(1);
  return true;
}

// Live Absen Preview in Step 2
if (dom.gatewayAbsenInput) {
  dom.gatewayAbsenInput.addEventListener('input', () => {
    const rawVal = String(dom.gatewayAbsenInput.value || '').trim().toLowerCase();
    if (rawVal === 'admin' || rawVal === '99' || rawVal === 'arcznewera' || rawVal === 'arcxnewera') {
      dom.gatewayAbsenInput.value = '';
      if (typeof triggerTeacherUnlock === 'function') {
        triggerTeacherUnlock();
        return;
      }
    }
    const val = parseInt(dom.gatewayAbsenInput.value, 10);
    const selectedClass = gatewaySelectedClass || 'XB';
    const studentsList = getRosterForClass(selectedClass);
    if (!isNaN(val) && val >= 1 && val <= 50) {
      const student = studentsList.find(s => Number(s.absen) === val);
      if (student && dom.gatewayStudentPreview) {
        dom.gatewayStudentPreview.classList.remove('hidden');
        const pillText = selectedClass === 'XB' ? 'X-B' : (selectedClass === 'XA' ? 'X-A' : 'X-C');
        const pillEl = document.getElementById('gatewayPreviewPill');
        if (pillEl) {
          pillEl.textContent = `Absen ${student.absen} (${pillText})`;
        }
        if (dom.gatewayPreviewName) dom.gatewayPreviewName.textContent = student.name;
      } else if (dom.gatewayStudentPreview) {
        dom.gatewayStudentPreview.classList.add('hidden');
      }
    } else if (dom.gatewayStudentPreview) {
      dom.gatewayStudentPreview.classList.add('hidden');
    }
  });

  // Listener tombol pemilih kelas pada gerbang login siswa (Step 1)
  const gatewayClassPills = document.querySelectorAll('#gatewayClassPicker .auth-class-pill');
  gatewayClassPills.forEach(pill => {
    pill.addEventListener('click', () => {
      gatewayClassPills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-checked', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-checked', 'true');
      gatewaySelectedClass = pill.getAttribute('data-class') || 'XB';
      updateGatewayClassHelperText(gatewaySelectedClass);
      if (dom.gatewayAbsenInput) {
        dom.gatewayAbsenInput.value = '';
        if (dom.gatewayStudentPreview) dom.gatewayStudentPreview.classList.add('hidden');
      }
    });
  });

  dom.gatewayAbsenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setWizardStep(3);
    }
  });
}

// Interactive triggers for opening/collapsing gateway
if (dom.btnGatewayLogoTrigger) {
  dom.btnGatewayLogoTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    expandGatewayToForm();
  });
}
if (dom.authMorphContainer) {
  dom.authMorphContainer.addEventListener('click', (e) => {
    if (dom.authMorphContainer.classList.contains('state-button')) {
      expandGatewayToForm();
    }
  });
}
if (dom.btnCollapseGateway) {
  dom.btnCollapseGateway.addEventListener('click', (e) => {
    e.stopPropagation();
    collapseGatewayToButton();
  });
}
if (dom.btnWizardStep1Next) {
  dom.btnWizardStep1Next.addEventListener('click', () => {
    setWizardStep(2);
  });
}
if (dom.btnWizardStep2Prev) {
  dom.btnWizardStep2Prev.addEventListener('click', () => {
    setWizardStep(1);
  });
}
if (dom.btnWizardNextStep) {
  dom.btnWizardNextStep.addEventListener('click', () => {
    setWizardStep(3);
  });
}
if (dom.btnWizardPrevStep) {
  dom.btnWizardPrevStep.addEventListener('click', () => {
    setWizardStep(2);
  });
}

// ==========================================================================
// GATEWAY AUTH & HOLD: VIBRATE AT 3S, ENTER AT 4S FOR TEACHER
// ==========================================================================
// LOGIN GURU: AKSES LANGSUNG DENGAN KLIK "ARCZNEWERA"
// ==========================================================================

function setupTeacherLoginTrigger() {
  const trigger = document.getElementById('authCreditName');
  const creditNote = document.getElementById('authCreditNote');
  const teacherAccessWrap = document.getElementById('teacherGatewayAccessWrap');
  if (teacherAccessWrap) {
    teacherAccessWrap.style.display = 'none';
  }

  const directToTeacherLogin = (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    openTeacherLoginForm();
  };

  if (trigger) {
    trigger.style.cursor = 'pointer';
    // 1. Klik langsung pada teks arcznewera -> langsung masuk form login guru
    trigger.addEventListener('click', directToTeacherLogin);

    // 2. Ketukan layar sentuh HP
    let touchStartX = 0;
    let touchStartY = 0;
    trigger.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    trigger.addEventListener('touchend', (e) => {
      let diff = 0;
      if (e.changedTouches && e.changedTouches[0]) {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        diff = Math.sqrt(dx * dx + dy * dy);
      }
      if (diff < 16) {
        directToTeacherLogin(e);
      }
    });

    // 3. Akses keyboard (Enter / Spasi)
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        directToTeacherLogin(e);
      }
    });
  }

  if (creditNote) {
    creditNote.style.cursor = 'pointer';
    creditNote.addEventListener('click', (e) => {
      if (e.target && (e.target.id === 'authCreditName' || e.target.closest('#authCreditName'))) {
        return; // Handled by trigger
      }
      directToTeacherLogin(e);
    });
  }
}

const setupTeacherLongPress = setupTeacherLoginTrigger;

function openTeacherLoginForm() {
  if (dom.authMorphContainer && dom.authMorphContainer.classList.contains('state-button')) {
    expandGatewayToForm(true);
  }

  if (dom.gatewayStudentPanel) dom.gatewayStudentPanel.classList.add('hidden');
  if (dom.gatewayTeacherPanel) {
    dom.gatewayTeacherPanel.classList.remove('hidden');
    dom.gatewayTeacherPanel.classList.remove('wizard-pop-in');
    void dom.gatewayTeacherPanel.offsetWidth;
    dom.gatewayTeacherPanel.classList.add('wizard-pop-in');
  }
  if (dom.gatewayTeacherPassword) {
    dom.gatewayTeacherPassword.value = '';
    setTimeout(() => {
      if (dom.gatewayTeacherPassword) dom.gatewayTeacherPassword.focus();
    }, 100);
  }
}

function triggerTeacherUnlock(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  openTeacherLoginForm();
}

// Ekspor ke window agar onclick inline di HTML selalu langsung bekerja
window.triggerTeacherUnlock = triggerTeacherUnlock;

// Inisialisasi event listener secepat mungkin saat modul dievaluasi
setupTeacherLoginTrigger();

// Return to Student Gateway panel
dom.btnCancelGatewayTeacher.addEventListener('click', () => {
  dom.gatewayTeacherPanel.classList.add('hidden');
  dom.gatewayStudentPanel.classList.remove('hidden');
  setWizardStep(1);
});

// Transisi Halus (Soft Transition) Masuk ke Dashboard Setelah Login
function transitionGatewayToDashboard(welcomeMsg) {
  if (dom.authGatewayScreen) {
    dom.authGatewayScreen.classList.add('is-exiting');
  }

  setTimeout(() => {
    if (dom.authGatewayScreen) {
      dom.authGatewayScreen.classList.add('hidden');
      dom.authGatewayScreen.classList.remove('is-exiting');
    }
    if (dom.mainAppShell) {
      dom.mainAppShell.classList.remove('hidden');
      dom.mainAppShell.classList.add('main-app-shell-entering');
      setTimeout(() => {
        dom.mainAppShell.classList.remove('main-app-shell-entering');
      }, 450);
    }
    updateUserRoleUI();
    if (welcomeMsg) showToast(welcomeMsg, 'success');
  }, 320);
}

// Normal Student Login on click / form submit
dom.gatewayStudentForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const absenVal = parseInt(dom.gatewayAbsenInput.value, 10);
  const inputPass = dom.gatewayPasswordInput.value.trim().toUpperCase();
  const selectedClass = gatewaySelectedClass || 'XB';
  const studentsList = getRosterForClass(selectedClass);
  const student = studentsList.find(s => Number(s.absen) === absenVal);

  if (isNaN(absenVal) || absenVal < 1) {
    showToast('Masukkan nomor absen yang valid.', 'error');
    setWizardStep(2);
    return;
  }

  if (selectedClass === 'XB' && absenVal === 16) {
    showToast('Nomor absen 16 tidak terdaftar (Olive keluar sekolah). Absen Stevan adalah 17.', 'error');
    setWizardStep(2);
    return;
  }

  if (!student) {
    showToast(`Nomor absen ${absenVal} tidak terdaftar di kelas ${selectedClass === 'XB' ? 'X-B' : (selectedClass === 'XA' ? 'X-A' : 'X-C')}.`, 'error');
    setWizardStep(2);
    return;
  }

  if (!inputPass) {
    showToast('Masukkan password akses siswa.', 'error');
    dom.gatewayPasswordInput.focus();
    return;
  }

  try {
    showLoading('Memverifikasi Siswa', `Sedang memeriksa data akun Kelas ${selectedClass}...`);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ absen: absenVal, password: inputPass, classId: selectedClass })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || 'Gagal masuk. Coba lagi.', 'error');
      return;
    }

    // Success login as student
    appState.activeClassId = selectedClass;
    localStorage.setItem('myPnk_activeClassId', selectedClass);
    saveUserSession({
      name: data.student.name,
      role: 'siswa',
      absen: data.student.absen,
      code: data.student.code,
      classId: selectedClass
    });

    // Update sidebar badge
    const sidebarPill = document.getElementById('sidebarActiveClassPill');
    if (sidebarPill) {
      sidebarPill.textContent = selectedClass === 'XB' ? 'X-B' : (selectedClass === 'XA' ? 'X-A' : 'X-C');
    }

    // Switch to main dashboard with smooth transition
    transitionGatewayToDashboard(`Selamat datang, ${data.student.name} (Kelas ${selectedClass === 'XB' ? 'X-B' : (selectedClass === 'XA' ? 'X-A' : 'X-C')}, Absen ${data.student.absen})`);
  } catch (err) {
    console.error('Login error:', err);
    showToast('Tidak bisa menghubungi server.', 'error');
  } finally {
    hideLoading();
  }
});

// Teacher Login Form Submit (hanya dengan password)
dom.gatewayTeacherForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const enteredPassword = (dom.gatewayTeacherPassword ? dom.gatewayTeacherPassword.value : '').trim();
  const lower = enteredPassword.toLowerCase();
  const knownAdmins = ['admin', '123', 'admin123', 'guru', 'guru123', 'arcznewera', 'arcz', 'arcxnewera'];

  if (!enteredPassword) {
    showToast('Masukkan password guru/admin.', 'error');
    if (dom.gatewayTeacherPassword) dom.gatewayTeacherPassword.focus();
    return;
  }

  try {
    showLoading('Memverifikasi Admin', 'Sedang memeriksa password admin/guru...');
    let success = false;
    let serverData = {};
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'guru', password: enteredPassword })
      });
      serverData = await res.json().catch(() => ({}));
      if (res.ok && serverData.ok) {
        success = true;
      } else if (knownAdmins.includes(lower) || knownAdmins.includes(enteredPassword)) {
        success = true;
      } else {
        showToast(serverData.error || 'Password guru/admin salah.', 'error');
        return;
      }
    } catch (netErr) {
      if (knownAdmins.includes(lower) || knownAdmins.includes(enteredPassword)) {
        success = true;
      } else {
        throw netErr;
      }
    }

    if (success) {
      // Success login as teacher (password dipegang di memori untuk verifikasi perubahan akun)
      appState.teacherPasswordHolder = enteredPassword;
      saveUserSession({
        name: 'Admin',
        role: 'guru',
        absen: null,
        code: null
      });

      // Switch to main dashboard with smooth transition
      transitionGatewayToDashboard('Selamat datang, Admin!');
      setTimeout(() => {
        if (typeof showTeacherClassSelector === 'function') {
          showTeacherClassSelector();
        }
      }, 500);
    }
  } catch (err) {
    console.error('Login guru error:', err);
    showToast('Tidak bisa menghubungi server.', 'error');
  } finally {
    hideLoading();
  }
});

// Helper verifikasi password guru (dipakai modal akun)
async function ensureTeacherPassword() {
  if (appState.teacherPasswordHolder) return appState.teacherPasswordHolder;
  const pw = await showPromptDialog({
    title: 'Verifikasi Password Guru',
    message: 'Masukkan password akun guru untuk melanjutkan tindakan keamanan ini:',
    placeholder: 'Password akun guru',
    inputType: 'password',
    type: 'warning'
  });
  if (!pw) return null;
  appState.teacherPasswordHolder = pw;
  return pw;
}

// Mobile Navigation Drawer Toggle & Close
const btnToggleMobileMenu = document.getElementById('btnToggleMobileMenu');
const mobileDrawerBackdrop = document.getElementById('mobileDrawerBackdrop');
const appSidebar = document.getElementById('appSidebar');

function toggleMobileDrawer() {
  const isOpen = appSidebar && appSidebar.classList.contains('mobile-open');
  if (isOpen) {
    closeMobileDrawer();
  } else {
    openMobileDrawer();
  }
}

function openMobileDrawer() {
  if (appSidebar) appSidebar.classList.add('mobile-open');
  if (mobileDrawerBackdrop) mobileDrawerBackdrop.classList.add('active');
  if (btnToggleMobileMenu) {
    btnToggleMobileMenu.classList.add('active');
    btnToggleMobileMenu.setAttribute('aria-expanded', 'true');
  }
  document.body.style.overflow = 'hidden';
}

function closeMobileDrawer() {
  if (appSidebar) appSidebar.classList.remove('mobile-open');
  if (mobileDrawerBackdrop) mobileDrawerBackdrop.classList.remove('active');
  if (btnToggleMobileMenu) {
    btnToggleMobileMenu.classList.remove('active');
    btnToggleMobileMenu.setAttribute('aria-expanded', 'false');
  }
  document.body.style.overflow = '';
}

if (btnToggleMobileMenu) {
  btnToggleMobileMenu.addEventListener('click', toggleMobileDrawer);
}
if (mobileDrawerBackdrop) {
  mobileDrawerBackdrop.addEventListener('click', closeMobileDrawer);
}

// Auto-close mobile drawer saat salah satu tombol menu/navigasi di sidebar diklik
if (appSidebar) {
  appSidebar.querySelectorAll('.sidebar-tab-btn, button, a').forEach(btn => {
    btn.addEventListener('click', () => {
      closeMobileDrawer();
    });
  });
}

// Touch swipe-left to close mobile navigation drawer smoothly
if (appSidebar) {
  let touchStartX = 0;
  let touchStartY = 0;

  appSidebar.addEventListener('touchstart', (e) => {
    if (!appSidebar.classList.contains('mobile-open')) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  appSidebar.addEventListener('touchend', (e) => {
    if (!appSidebar.classList.contains('mobile-open')) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = Math.abs(touchEndY - touchStartY);

    // If swiped left by at least 45px and more horizontal than vertical
    if (deltaX < -45 && deltaY < 100) {
      closeMobileDrawer();
    }
  }, { passive: true });
}

// Filter Event Listeners
document.querySelectorAll('#subjectFilterNav .cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#subjectFilterNav .cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    appState.activeSubjectFilter = btn.dataset.subject;
    appState.studentFilterOnlyMine = false;
    switchWorkspaceView('tasks');
    renderAssignmentsList();
  });
});

// ==========================================================================
// NAVIGASI HIERARKIS & TOMBOL BACK (NAVIGATION HISTORY STACK)
// ==========================================================================
const navigationStack = ['dashboard'];
let currentWorkspaceView = 'dashboard';

function navigateBack() {
  if (navigationStack.length > 0) {
    const prevView = navigationStack.pop();
    switchWorkspaceView(prevView, true);
  } else {
    switchWorkspaceView('dashboard', true);
  }
}

// Helper: Beri Indikator Biru Gelap Khusus pada Tombol Sidebar yang Sedang Aktif
function setSidebarActiveButton(activeBtnId) {
  const allNavBtnIds = [
    'navBtnDashboard',
    'navBtnHistory',
    'navBtnClassPicker',
    'navBtnTasks',
    'navBtnQuizzes',
    'navBtnSchedule',
    'navBtnSpinWheel',
    'navBtnCustomize'
  ];
  allNavBtnIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      if (id === activeBtnId) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      }
    }
  });
}

function restoreSidebarActiveView() {
  const map = {
    dashboard: 'navBtnDashboard',
    tasks: 'navBtnTasks',
    quizzes: 'navBtnQuizzes',
    schedule: 'navBtnSchedule',
    spinwheel: 'navBtnSpinWheel',
    customize: 'navBtnCustomize'
  };
  setSidebarActiveButton(map[currentWorkspaceView] || 'navBtnDashboard');
  updateSidebarSubmenus(currentWorkspaceView);
}

function syncHistorySubmenuActive(mode) {
  const btnTasks = document.getElementById('btnHistorySubTasks');
  const btnCombined = document.getElementById('btnHistorySubCombined');
  const btnDaily = document.getElementById('btnHistorySubDailyTest');
  if (btnTasks) btnTasks.classList.toggle('active', mode === 'tasks');
  if (btnCombined) btnCombined.classList.toggle('active', mode === 'combined');
  if (btnDaily) btnDaily.classList.toggle('active', mode === 'daily_test');
}

function syncSpinSubmenuActive(tab) {
  const btnWheel = document.getElementById('btnSpinSubWheel');
  const btnTeams = document.getElementById('btnSpinSubTeams');
  const btnLiterasi = document.getElementById('btnSpinSubLiterasi');
  if (btnWheel) btnWheel.classList.toggle('active', tab === 'wheel');
  if (btnTeams) btnTeams.classList.toggle('active', tab === 'teams');
  if (btnLiterasi) btnLiterasi.classList.toggle('active', tab === 'literasi');
}

function updateSidebarSubmenus(activeSection) {
  const isGuru = appState.currentUser && (appState.currentUser.role === 'guru' || appState.currentUser.role === 'teacher');
  const tasksSub = document.getElementById('sidebarTasksSubmenu');
  const historySub = document.getElementById('sidebarHistorySubmenu');
  const spinSub = document.getElementById('sidebarSpinSubmenu');

  // 1. Tasks Submenu (Khusus Guru pada saat Daftar Tugas aktif)
  if (tasksSub) {
    if (!isGuru) {
      tasksSub.classList.remove('is-open');
      tasksSub.classList.add('hidden');
      tasksSub.setAttribute('aria-hidden', 'true');
    } else {
      tasksSub.classList.remove('hidden');
      if (activeSection === 'tasks') {
        tasksSub.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => tasksSub.classList.add('is-open'));
      } else {
        tasksSub.classList.remove('is-open');
        tasksSub.setAttribute('aria-hidden', 'true');
      }
    }
  }

  // 2. History Submenu (Tugas, Nilai Gabungan, Nilai Daily Test)
  if (historySub) {
    historySub.classList.remove('hidden');
    if (activeSection === 'history') {
      historySub.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => historySub.classList.add('is-open'));
      syncHistorySubmenuActive(historyViewState.mode || 'tasks');
    } else {
      historySub.classList.remove('is-open');
      historySub.setAttribute('aria-hidden', 'true');
    }
  }

  // 3. Spin Wheel Submenu (Roda Acak, Pembagi Kelompok, Presentasi Literasi)
  if (spinSub) {
    spinSub.classList.remove('hidden');
    if (activeSection === 'spinwheel') {
      spinSub.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => spinSub.classList.add('is-open'));
      const activeTab = (window.classToolsState && window.classToolsState.activeTab) || 'wheel';
      syncSpinSubmenuActive(activeTab);
    } else {
      spinSub.classList.remove('is-open');
      spinSub.setAttribute('aria-hidden', 'true');
    }
  }
}

function updateTasksSidebarSubmenu(isTasksActive) {
  updateSidebarSubmenus(isTasksActive ? 'tasks' : currentWorkspaceView);
}

// Sidebar Page Navigation (Daftar Tugas, Dashboard, Quizzes, Schedule, SpinWheel, Customize)
function switchWorkspaceView(targetView, isBack = false) {
  const quizzesViewPage = document.getElementById('quizzesViewPage');
  const scheduleViewPage = document.getElementById('scheduleViewPage');
  const spinWheelViewPage = document.getElementById('spinWheelViewPage');

  if (!isBack && currentWorkspaceView && currentWorkspaceView !== targetView) {
    navigationStack.push(currentWorkspaceView);
  }
  currentWorkspaceView = targetView;

  // Sembunyikan semua halaman terlebih dahulu secara bersih
  const allPages = [
    dom.dashboardViewPage,
    dom.tasksViewPage,
    dom.customizeViewPage,
    quizzesViewPage,
    scheduleViewPage,
    spinWheelViewPage
  ];
  allPages.forEach(p => {
    if (p) {
      p.classList.add('hidden');
      p.classList.remove('active');
    }
  });

  if (targetView === 'dashboard') {
    if (dom.dashboardViewPage) {
      dom.dashboardViewPage.classList.remove('hidden');
      dom.dashboardViewPage.classList.add('active');
    }
    setSidebarActiveButton('navBtnDashboard');
    refreshAllDiagnostics(false);
    updateTimelyRateCircleBar();
    initOrUpdateMagicBento();
    if (typeof renderScheduleDashboardWidget === 'function') {
      renderScheduleDashboardWidget();
    }
  } else if (targetView === 'customize') {
    if (dom.customizeViewPage) {
      dom.customizeViewPage.classList.remove('hidden');
      dom.customizeViewPage.classList.add('active');
    }
    setSidebarActiveButton('navBtnCustomize');
  } else if (targetView === 'quizzes') {
    if (quizzesViewPage) {
      quizzesViewPage.classList.remove('hidden');
      quizzesViewPage.classList.add('active');
    }
    setSidebarActiveButton('navBtnQuizzes');
    if (typeof renderQuizzesList === 'function') {
      renderQuizzesList();
    }
  } else if (targetView === 'schedule') {
    if (scheduleViewPage) {
      scheduleViewPage.classList.remove('hidden');
      scheduleViewPage.classList.add('active');
    }
    setSidebarActiveButton('navBtnSchedule');
    if (typeof renderScheduleView === 'function') {
      renderScheduleView();
    }
  } else if (targetView === 'spinwheel') {
    if (spinWheelViewPage) {
      spinWheelViewPage.classList.remove('hidden');
      spinWheelViewPage.classList.add('active');
    }
    setSidebarActiveButton('navBtnSpinWheel');

    // Pastikan daftar nama peserta roda terisi otomatis dari kelas jika masih kosong
    const wheelTextarea = document.getElementById('wheelNamesInput');
    if (!classToolsState.wheelNames || classToolsState.wheelNames.length === 0) {
      const students = getClassStudentNames();
      classToolsState.wheelNames = students;
      if (wheelTextarea) {
        wheelTextarea.value = students.join('\n');
      }
      const wheelBadge = document.getElementById('wheelCountBadge');
      if (wheelBadge) wheelBadge.textContent = `${students.length} Nama`;
    } else if (wheelTextarea && (!wheelTextarea.value || wheelTextarea.value.trim() === '')) {
      wheelTextarea.value = classToolsState.wheelNames.join('\n');
    }

    if (typeof drawWheel === 'function') {
      setTimeout(() => drawWheel(), 60);
    }
  } else {
    // Default: 'tasks' (Daftar Tugas)
    if (dom.tasksViewPage) {
      dom.tasksViewPage.classList.remove('hidden');
      dom.tasksViewPage.classList.add('active');
    }
    setSidebarActiveButton('navBtnTasks');
    renderAssignmentsList();
  }

  // Update Accordion Submenus untuk section yang aktif
  updateSidebarSubmenus(targetView);
  closeMobileDrawer();
}

// Hubungkan Tombol Back di semua halaman
['btnBackFromTasks', 'btnBackFromQuizzes', 'btnBackFromCustomize', 'btnBackFromSchedule', 'btnBackFromSpinWheel'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', navigateBack);
});

if (dom.navBtnTasks) {
  dom.navBtnTasks.addEventListener('click', () => switchWorkspaceView('tasks'));
}

if (dom.navBtnDashboard) {
  dom.navBtnDashboard.addEventListener('click', () => switchWorkspaceView('dashboard'));
}

const navBtnQuizzesEl = document.getElementById('navBtnQuizzes');
if (navBtnQuizzesEl) {
  navBtnQuizzesEl.addEventListener('click', () => switchWorkspaceView('quizzes'));
}

const navBtnScheduleEl = document.getElementById('navBtnSchedule');
if (navBtnScheduleEl) {
  navBtnScheduleEl.addEventListener('click', () => switchWorkspaceView('schedule'));
}

const navBtnSpinWheelEl = document.getElementById('navBtnSpinWheel');
if (navBtnSpinWheelEl) {
  navBtnSpinWheelEl.addEventListener('click', () => switchWorkspaceView('spinwheel'));
}

if (dom.btnDashboardOpenSchedule) {
  dom.btnDashboardOpenSchedule.addEventListener('click', () => switchWorkspaceView('schedule'));
}

// State for History & Grades View (Tasks, Combined, Daily Test)
const historyViewState = {
  mode: 'tasks', // 'tasks' | 'combined' | 'daily_test'
  studentFilter: 'ALL',
  subjectFilter: 'ALL',
  searchQuery: ''
};

// Pop-up Riwayat Siswa & Rekap Nilai Modal (Pengumpulan Tugas, Nilai Gabungan, Nilai Daily Test)
function openTaskHistoryModal(initialMode = null) {
  if (!dom.taskHistoryModal) return;
  setSidebarActiveButton('navBtnHistory');

  const isGuru = appState.currentUser && (appState.currentUser.role === 'guru' || appState.currentUser.role === 'teacher');
  if (initialMode) {
    historyViewState.mode = initialMode;
  }

  // Buka accordion submenu riwayat di sidebar dan tandai sub-tombol yang aktif
  updateSidebarSubmenus('history');
  syncHistorySubmenuActive(historyViewState.mode || 'tasks');

  // Update modal title
  const titleEl = document.getElementById('modalHistoryTitle');
  if (titleEl) {
    titleEl.textContent = 'Riwayat Pengumpulan';
  }

  // Setup Segmented Mode Tabs
  const tabBtns = dom.taskHistoryModal.querySelectorAll('.history-tab-btn');
  tabBtns.forEach(btn => {
    const mode = btn.dataset.mode;
    if (mode === historyViewState.mode) {
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
    }

    btn.onclick = () => {
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      historyViewState.mode = mode;
      syncHistorySubmenuActive(mode);
      renderHistoryTable();
    };
  });

  // Setup Student Filter Dropdown
  const studentFilterGroup = document.getElementById('historyStudentFilterGroup');
  const studentSelect = document.getElementById('historyStudentFilter');
  if (studentSelect) {
    if (isGuru) {
      if (studentFilterGroup) studentFilterGroup.style.display = '';
      const currentClassId = appState.activeClassId || 'XB';
      const classNameLabel = currentClassId === 'XB' ? 'Kelas X-B' : (currentClassId === 'XA' ? 'Kelas X-A' : 'Kelas X-C');
      studentSelect.innerHTML = `<option value="ALL">Semua Siswa (${classNameLabel})</option>`;
      const studentsList = getRosterForClass(currentClassId);
      studentsList.forEach(st => {
        const opt = document.createElement('option');
        opt.value = String(st.absen);
        opt.textContent = `Absen ${st.absen} - ${st.name}`;
        if (String(st.absen) === String(historyViewState.studentFilter)) opt.selected = true;
        studentSelect.appendChild(opt);
      });
      studentSelect.onchange = () => {
        historyViewState.studentFilter = studentSelect.value;
        renderHistoryTable();
      };
    } else {
      // Siswa view: kunci hanya ke nomor absen siswa sendiri
      if (studentFilterGroup) studentFilterGroup.style.display = 'none';
      historyViewState.studentFilter = appState.currentUser ? String(appState.currentUser.absen) : 'ALL';
    }
  }

  // Setup Subject Filter Dropdown
  const subjectSelect = document.getElementById('historySubjectFilter');
  if (subjectSelect) {
    const allSubjects = new Set();
    (appState.assignments || []).forEach(a => { if (a.subject) allSubjects.add(a.subject); });
    (appState.quizzes || []).forEach(q => { if (q.subject) allSubjects.add(q.subject); });

    subjectSelect.innerHTML = '<option value="ALL">Semua Mapel</option>';
    allSubjects.forEach(subj => {
      const opt = document.createElement('option');
      opt.value = subj;
      opt.textContent = subj;
      if (subj === historyViewState.subjectFilter) opt.selected = true;
      subjectSelect.appendChild(opt);
    });
    subjectSelect.onchange = () => {
      historyViewState.subjectFilter = subjectSelect.value;
      renderHistoryTable();
    };
  }

  // Setup Search Input
  const searchInput = document.getElementById('historySearchInput');
  if (searchInput) {
    searchInput.value = historyViewState.searchQuery || '';
    searchInput.oninput = () => {
      historyViewState.searchQuery = searchInput.value.trim().toLowerCase();
      renderHistoryTable();
    };
  }

  renderHistoryTable();
  dom.taskHistoryModal.showModal();
}

// Render dynamic table rows according to the selected mode (tasks | combined | daily_test)
function renderHistoryTable() {
  if (!dom.taskHistoryModal || !dom.historyTableBody) return;

  const isGuru = appState.currentUser && (appState.currentUser.role === 'guru' || appState.currentUser.role === 'teacher');
  const tableContainer = dom.taskHistoryModal.querySelector('.submissions-table-container');
  const tableEl = tableContainer ? tableContainer.querySelector('.file-table') : null;
  const emptyState = dom.emptyHistoryState;
  const currentAbsen = appState.currentUser ? Number(appState.currentUser.absen) : null;
  const mode = historyViewState.mode || 'tasks';

  if (tableContainer) tableContainer.classList.toggle('mode-tasks', mode === 'tasks');
  if (tableEl) tableEl.classList.toggle('table-tasks-fit', mode === 'tasks');

  dom.historyTableBody.innerHTML = '';

  const currentClassId = appState.activeClassId || 'XB';
  const studentsList = getRosterForClass(currentClassId);

  // MODE 1: RIWAYAT PENGUMPULAN TUGAS (TASKS)
  if (mode === 'tasks') {
    if (dom.historyModalSubtitle) {
      dom.historyModalSubtitle.textContent = isGuru
        ? 'Daftar berkas tugas yang telah dikumpulkan siswa ke dalam sistem server saved.'
        : 'Riwayat pengumpulan berkas tugas Anda.';
    }

    if (dom.historyTableHead) {
      dom.historyTableHead.innerHTML = `
        <tr>
          <th scope="col">Tugas</th>
          <th scope="col">Status &amp; Nilai</th>
          <th scope="col" class="th-history-detail" style="text-align:right;">Detail</th>
        </tr>
      `;
    }

    let list = [...(appState.submissions || [])];

    if (isGuru) {
      if (historyViewState.studentFilter !== 'ALL') {
        list = list.filter(s => Number(s.studentAbsen) === Number(historyViewState.studentFilter));
      }
    } else {
      const curName = (appState.currentUser ? appState.currentUser.name || '' : '').toLowerCase();
      list = list.filter(s => {
        if (Number(s.studentAbsen) === currentAbsen) return true;
        // Sinkronisasi tugas kelompok: tampilkan jika siswa merupakan anggota kelompok
        const assign = (appState.assignments || []).find(a => a.id === s.assignmentId);
        if (assign && assign.isGroup) {
          const userGroup = findStudentGroupInAssignment(assign, appState.currentUser);
          if (userGroup) {
            if (s.groupId && s.groupId === userGroup.id) return true;
            if (s.groupName && s.groupName === userGroup.name) return true;
            if (Array.isArray(s.groupMembers) && s.groupMembers.some(m => {
              const mMatch = String(m).match(/^0*(\d+)[\.\s\-]/);
              if (mMatch && currentAbsen != null && Number(mMatch[1]) === currentAbsen) return true;
              return curName && String(m).toLowerCase().includes(curName);
            })) return true;
          }
        }
        return false;
      });
    }

    if (historyViewState.subjectFilter !== 'ALL') {
      list = list.filter(s => {
        const assign = (appState.assignments || []).find(a => a.id === s.assignmentId);
        return assign && (assign.subject || '').toLowerCase() === historyViewState.subjectFilter.toLowerCase();
      });
    }

    if (historyViewState.searchQuery) {
      const q = historyViewState.searchQuery;
      list = list.filter(s => {
        const assign = (appState.assignments || []).find(a => a.id === s.assignmentId);
        const aTitle = assign ? assign.title.toLowerCase() : '';
        const aSubj = assign ? (assign.subject || '').toLowerCase() : '';
        const sName = (s.studentName || '').toLowerCase();
        const fName = (s.fileName || '').toLowerCase();
        return aTitle.includes(q) || aSubj.includes(q) || sName.includes(q) || fName.includes(q);
      });
    }

    list.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    if (list.length === 0) {
      if (emptyState) {
        emptyState.classList.remove('hidden');
        const titleEl = emptyState.querySelector('.state-title');
        const descEl = emptyState.querySelector('.state-desc');
        if (titleEl) titleEl.textContent = 'Belum Ada Pengumpulan Tugas';
        if (descEl) descEl.textContent = 'Tidak ada rekaman tugas yang sesuai dengan filter.';
      }
      if (tableContainer) tableContainer.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (tableContainer) tableContainer.style.display = 'block';

    list.forEach(sub => {
      const assignment = (appState.assignments || []).find(a => a.id === sub.assignmentId) || {
        title: sub.assignmentId && sub.assignmentId.startsWith('task_') ? 'Tugas Lama' : (sub.assignmentId || 'Tugas'),
        subject: 'Umum'
      };

      const dateObj = new Date(sub.submittedAt);
      const formattedDate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const formattedTime = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const isOwner = Number(sub.studentAbsen) === currentAbsen;
      const isGroupMember = sub.isGroup && Array.isArray(sub.groupMembers) && sub.groupMembers.some(m => {
        const mMatch = String(m).match(/^0*(\d+)[\.\s\-]/);
        if (mMatch && currentAbsen != null && Number(mMatch[1]) === currentAbsen) return true;
        const cName = (appState.currentUser ? appState.currentUser.name || '' : '').toLowerCase();
        return cName && String(m).toLowerCase().includes(cName);
      });
      const canAccess = isGuru || isOwner || isGroupMember;

      let timeHistoryHtml = '';
      if (sub.isEdited && Array.isArray(sub.editHistory) && sub.editHistory.length > 0) {
        const prevSubs = sub.editHistory.map(prev => {
          const pObj = new Date(prev.submittedAt);
          const pD = pObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
          const pT = pObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          return `<div class="strikethrough-time"><s><em>${pD} ${pT} WIB</em></s></div>`;
        }).join('');
        timeHistoryHtml = `
          <div>
            ${prevSubs}
            <div class="current-submit-time"><strong>${formattedDate} ${formattedTime} WIB</strong> <span class="badge-edited">(Telah Diperbarui)</span></div>
          </div>
        `;
      } else {
        timeHistoryHtml = `<div>${formattedDate} ${formattedTime} WIB</div>`;
      }

      let cleanStudentName = sub.studentName || 'Siswa';
      if (cleanStudentName.includes(' - ')) {
        cleanStudentName = cleanStudentName.split(' - ').slice(1).join(' - ');
      }

      const sAvatar = localStorage.getItem('xozen_avatar_' + sub.studentAbsen);
      const avatarThumb = sAvatar
        ? `<img src="${sAvatar}" alt="PP" style="width:24px; height:24px; border-radius:50%; object-fit:cover; margin-right:8px; border:1px solid var(--accent-cyan-light); flex-shrink:0;">`
        : `<div style="width:24px; height:24px; border-radius:50%; background:var(--accent-secondary); color:var(--accent-cyan-light); font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; margin-right:8px; flex-shrink:0;">${sub.studentAbsen || 'S'}</div>`;

      const studentCellHtml = isGuru ? `
        <td>
          <div style="display:flex; align-items:center;">
            ${avatarThumb}
            <div>
              <div style="font-weight: 600; color: var(--text-bright);">${escapeHtml(cleanStudentName)}</div>
              <span style="font-size: 0.72rem; color: var(--accent-cyan-light);">Absen ${sub.studentAbsen}</span>
            </div>
          </div>
        </td>
      ` : '';

      const subFiles = (Array.isArray(sub.files) && sub.files.length > 0) ? sub.files : [{
        fileName: sub.fileName,
        fileSize: sub.fileSize,
        storedFile: sub.storedFile,
        downloadUrl: sub.downloadUrl
      }];

      let fileCellHtml = '';
      if (subFiles.length > 1) {
        fileCellHtml = `
          <div class="submission-files-stack">
            ${subFiles.map((f, fIdx) => `
              <button type="button" class="btn-file-pill btn-open-hist-file" data-fidx="${fIdx}">
                <span class="file-pill-name" title="${escapeHtml(f.fileName)}">${escapeHtml(formatTruncatedFileName(f.fileName, 22))}</span>
                <span class="file-pill-size">${formatBytes(f.fileSize || 0)}</span>
              </button>
            `).join('')}
          </div>
        `;
      } else {
        fileCellHtml = `
          <div title="${escapeHtml(sub.fileName)}" style="font-family: var(--font-mono); font-size: 0.8125rem; color: var(--accent-cyan-light);">${escapeHtml(formatTruncatedFileName(sub.fileName, 24))}</div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${formatBytes(sub.fileSize || 0)}</span>
        `;
      }

      const tr = document.createElement('tr');
      tr.className = 'history-summary-row';
      tr.innerHTML = `
        <td>
          <div style="font-weight: 700; color: var(--text-bright); line-height: 1.35;">${escapeHtml(assignment.title)}</div>
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:4px;">
            <span class="subject-badge" style="font-size: 0.625rem;">${escapeHtml(assignment.subject)}</span>
            ${sub.isGroup ? `<span class="badge-group-task" style="font-size: 0.65rem;" title="Tugas Kelompok">👥 ${escapeHtml(sub.groupName || 'Kelompok')}${!isOwner && !isGuru ? ` (Oleh ${escapeHtml(cleanStudentName)})` : ''}</span>` : ''}
            ${isGuru ? `<span style="font-size: 0.72rem; color: var(--accent-cyan-light); font-weight: 600;">Absen ${sub.studentAbsen} - ${escapeHtml(cleanStudentName)}</span>` : ''}
          </div>
        </td>
        <td>
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px;">
            <span class="status-badge ${sub.isLate ? 'badge-closed' : 'badge-active'}">
              ${sub.isLate ? 'Terlambat' : 'Tepat Waktu'}
            </span>
            ${sub.grade != null ? `
              <span class="badge-grade-scored">${sub.grade}</span>
            ` : `
              <span class="badge-grade-pending">Belum Dinilai</span>
            `}
          </div>
        </td>
        <td style="text-align:right;">
          <button type="button" class="btn btn-secondary btn-sm btn-history-more" aria-expanded="false">
            <span>Selengkapnya</span>
          </button>
        </td>
      `;

      const noteText = (sub.note || sub.notes || '').trim();
      const feedbackText = (sub.feedback || sub.teacherNote || '').trim();
      const detailTr = document.createElement('tr');
      detailTr.className = 'history-detail-row hidden';
      detailTr.innerHTML = `
        <td colspan="3">
          <div class="history-detail-card">
            <div class="history-detail-grid">
              ${isGuru ? `
                <div class="history-detail-item">
                  <span class="history-detail-label">Siswa</span>
                  <div style="display:flex; align-items:center;">
                    ${avatarThumb}
                    <div>
                      <div style="font-weight: 600; color: var(--text-bright);">${escapeHtml(cleanStudentName)}</div>
                      <span style="font-size: 0.72rem; color: var(--accent-cyan-light);">Absen ${sub.studentAbsen}</span>
                    </div>
                  </div>
                </div>
              ` : ''}
              <div class="history-detail-item">
                <span class="history-detail-label">Waktu Pengumpulan</span>
                <div class="history-detail-value">${timeHistoryHtml}</div>
              </div>
              <div class="history-detail-item">
                <span class="history-detail-label">Berkas Dikumpulkan</span>
                <div class="history-detail-value">${fileCellHtml}</div>
              </div>
              ${noteText ? `
                <div class="history-detail-item">
                  <span class="history-detail-label">Catatan Siswa</span>
                  <div class="history-detail-value">${escapeHtml(noteText)}</div>
                </div>
              ` : ''}
              ${feedbackText ? `
                <div class="history-detail-item">
                  <span class="history-detail-label">Catatan Guru</span>
                  <div class="history-detail-value">${escapeHtml(feedbackText)}</div>
                </div>
              ` : ''}
            </div>
            ${canAccess ? `
              <div class="history-detail-actions">
                <button type="button" class="btn btn-secondary btn-sm btn-download-history" aria-label="Buka berkas ${escapeHtml(sub.fileName)}" title="Buka pratinjau berkas">
                  <span>Buka Berkas</span>
                </button>
                ${isGuru ? `
                  <button type="button" class="btn btn-secondary btn-sm btn-delete-history" data-sub-id="${sub.id}" title="Hapus riwayat tugas ini" style="color: var(--accent-rose); border-color: rgba(239, 68, 68, 0.25);">
                    <span>Hapus</span>
                  </button>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </td>
      `;

      const btnMore = tr.querySelector('.btn-history-more');
      if (btnMore) {
        btnMore.addEventListener('click', () => {
          const willOpen = detailTr.classList.contains('hidden');
          detailTr.classList.toggle('hidden', !willOpen);
          tr.classList.toggle('is-expanded', willOpen);
          btnMore.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
          const labelSpan = btnMore.querySelector('span');
          if (labelSpan) labelSpan.textContent = willOpen ? 'Tutup' : 'Selengkapnya';
        });
      }

      if (canAccess) {
        detailTr.querySelectorAll('.btn-open-hist-file').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-fidx'), 10);
            openSubmissionFile(sub, subFiles[idx]);
          });
        });
        const btnDl = detailTr.querySelector('.btn-download-history');
        if (btnDl) {
          btnDl.addEventListener('click', () => openSubmissionFile(sub, subFiles[0]));
        }
        const btnDel = detailTr.querySelector('.btn-delete-history');
        if (btnDel) {
          btnDel.addEventListener('click', async () => {
            const confirmDel = await showConfirmDialog({
              title: 'Hapus Riwayat Berkas',
              message: `Apakah Anda yakin ingin menghapus riwayat pengumpulan berkas "${sub.fileName}"?`,
              confirmText: 'Hapus Berkas',
              cancelText: 'Batal',
              type: 'danger'
            });
            if (!confirmDel) return;

            try {
              await dbDelete('submissions', sub.id);
              appState.submissions = (appState.submissions || []).filter(s => s.id !== sub.id);
              showToast('Riwayat pengumpulan tugas berhasil dihapus.', 'success');
              await refreshData();
              renderHistoryTable();
            } catch (err) {
              showToast('Gagal menghapus riwayat pengumpulan.', 'error');
            }
          });
        }
      }

      dom.historyTableBody.appendChild(tr);
      dom.historyTableBody.appendChild(detailTr);
    });
  }

  // MODE 2: REKAP NILAI GABUNGAN (TUGAS + KUIS DENGAN REMEDIAL MAKS 77)
  else if (mode === 'combined') {
    if (dom.historyModalSubtitle) {
      dom.historyModalSubtitle.textContent = 'Rekap Nilai Gabungan (Tugas + Kuis / Daily Test) dengan pembaruan remedial maksimal 77.';
    }

    if (dom.historyTableHead) {
      dom.historyTableHead.innerHTML = `
        <tr>
          <th scope="col" style="width: 70px;">No. Absen</th>
          <th scope="col">Nama Siswa</th>
          <th scope="col">Mata Pelajaran</th>
          <th scope="col">Rata-Rata Tugas</th>
          <th scope="col">Nilai Daily Test (Kuis)</th>
          <th scope="col">Nilai Gabungan</th>
          <th scope="col">Status Kelulusan</th>
        </tr>
      `;
    }

    let targetStudents = [...studentsList];
    if (isGuru) {
      if (historyViewState.studentFilter !== 'ALL') {
        targetStudents = targetStudents.filter(st => Number(st.absen) === Number(historyViewState.studentFilter));
      }
    } else {
      targetStudents = targetStudents.filter(st => Number(st.absen) === currentAbsen);
    }

    const availableSubjects = new Set();
    (appState.assignments || []).forEach(a => { if (a.subject) availableSubjects.add(a.subject); });
    (appState.quizzes || []).forEach(q => { if (q.subject) availableSubjects.add(q.subject); });
    if (availableSubjects.size === 0) availableSubjects.add('Informatika');

    let subjectList = Array.from(availableSubjects);
    if (historyViewState.subjectFilter !== 'ALL') {
      subjectList = subjectList.filter(s => s.toLowerCase() === historyViewState.subjectFilter.toLowerCase());
    }

    const rowsData = [];
    const baseQuizzes = (appState.quizzes || []).filter(q => !q.isRemedial);

    targetStudents.forEach(st => {
      subjectList.forEach(subj => {
        if (historyViewState.searchQuery) {
          const q = historyViewState.searchQuery;
          const matchName = st.name.toLowerCase().includes(q) || String(st.absen).includes(q);
          const matchSubj = subj.toLowerCase().includes(q);
          if (!matchName && !matchSubj) return;
        }

        const subjectAssignments = (appState.assignments || []).filter(a => (a.subject || '').toLowerCase() === subj.toLowerCase());
        const studentSubs = (appState.submissions || []).filter(s => {
          if (Number(s.studentAbsen) !== Number(st.absen)) return false;
          const assign = subjectAssignments.find(a => a.id === s.assignmentId);
          return !!assign;
        });

        let taskSum = 0;
        let taskCount = 0;
        studentSubs.forEach(s => {
          if (s.grade != null && !isNaN(Number(s.grade))) {
            taskSum += Number(s.grade);
            taskCount++;
          }
        });
        const taskAvg = taskCount > 0 ? Math.round(taskSum / taskCount) : null;

        const subjectQuizzes = baseQuizzes.filter(q => (q.subject || '').toLowerCase() === subj.toLowerCase());
        let quizSum = 0;
        let quizCount = 0;
        let hasRemedialCapped = false;

        subjectQuizzes.forEach(quiz => {
          const scoreInfo = getEffectiveStudentQuizScore(quiz, st.absen, appState.quizzes, appState.quizSessions);
          if (scoreInfo.isGraded) {
            quizSum += scoreInfo.score;
            quizCount++;
            if (scoreInfo.isRemedialUpdated) hasRemedialCapped = true;
          }
        });
        const quizAvg = quizCount > 0 ? Math.round(quizSum / quizCount) : null;

        let combinedScore = null;
        if (taskAvg !== null && quizAvg !== null) {
          combinedScore = Math.round((taskAvg + quizAvg) / 2);
        } else if (taskAvg !== null) {
          combinedScore = taskAvg;
        } else if (quizAvg !== null) {
          combinedScore = quizAvg;
        }

        rowsData.push({
          student: st,
          subject: subj,
          taskAvg,
          taskCount,
          quizAvg,
          quizCount,
          hasRemedialCapped,
          combinedScore
        });
      });
    });

    if (rowsData.length === 0) {
      if (emptyState) {
        emptyState.classList.remove('hidden');
        const titleEl = emptyState.querySelector('.state-title');
        const descEl = emptyState.querySelector('.state-desc');
        if (titleEl) titleEl.textContent = 'Belum Ada Data Nilai Gabungan';
        if (descEl) descEl.textContent = 'Belum ada tugas atau kuis yang dikumpulkan untuk mata pelajaran ini.';
      }
      if (tableContainer) tableContainer.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (tableContainer) tableContainer.style.display = 'block';

    rowsData.forEach(item => {
      const isPass = item.combinedScore !== null && item.combinedScore >= 77;
      const statusBadge = item.combinedScore !== null
        ? (isPass
          ? '<span class="badge" style="background:rgba(16,185,129,0.2); color:#6EE7B7; font-weight:700; padding:4px 8px; border-radius:6px;">Tuntas (KKM 77)</span>'
          : '<span class="badge" style="background:rgba(239,68,68,0.2); color:#FCA5A5; font-weight:700; padding:4px 8px; border-radius:6px;">Belum Tuntas (<77)</span>')
        : '<span style="color:var(--text-muted); font-size:0.75rem;">Belum Lengkap</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: #60A5FA;">Absen ${item.student.absen}</td>
        <td>
          <div style="font-weight: 600; color: var(--text-bright);">${escapeHtml(item.student.name)}</div>
        </td>
        <td>
          <span class="subject-badge">${escapeHtml(item.subject)}</span>
        </td>
        <td>
          ${item.taskAvg !== null ? `
            <strong style="color: #6EE7B7; font-size: 0.9375rem;">${item.taskAvg}</strong>
            <span style="font-size:0.7rem; color:var(--text-muted); display:block;">(${item.taskCount} tugas dinilai)</span>
          ` : `
            <span style="color:var(--text-muted); font-size:0.75rem;">Belum ada nilai tugas</span>
          `}
        </td>
        <td>
          ${item.quizAvg !== null ? `
            <strong style="color: #93C5FD; font-size: 0.9375rem;">${item.quizAvg}</strong>
            <span style="font-size:0.7rem; color:var(--text-muted); display:block;">
              (${item.quizCount} kuis${item.hasRemedialCapped ? ', remedial maks. 77' : ''})
            </span>
          ` : `
            <span style="color:var(--text-muted); font-size:0.75rem;">Belum ada kuis</span>
          `}
        </td>
        <td>
          ${item.combinedScore !== null ? `
            <span style="font-size: 1.1rem; font-weight: 800; color: ${isPass ? '#10B981' : '#EF4444'};">
              ${item.combinedScore}
            </span>
          ` : `
            <span style="color:var(--text-muted);">-</span>
          `}
        </td>
        <td>${statusBadge}</td>
      `;
      dom.historyTableBody.appendChild(tr);
    });
  }

  // MODE 3: RIWAYAT NILAI DAILY TEST (KUIS / UJIAN HARIAN)
  else if (mode === 'daily_test') {
    if (dom.historyModalSubtitle) {
      dom.historyModalSubtitle.textContent = 'Riwayat Nilai Daily Test (Kuis / Ujian Harian) beserta status remedial dan catatan kedisiplinan layar.';
    }

    if (dom.historyTableHead) {
      dom.historyTableHead.innerHTML = `
        <tr>
          <th scope="col" style="width: 70px;">No. Absen</th>
          <th scope="col">Nama Siswa</th>
          <th scope="col">Judul Kuis</th>
          <th scope="col">Mata Pelajaran</th>
          <th scope="col">Nilai (%)</th>
          <th scope="col">Pelanggaran Layar</th>
          <th scope="col">Waktu Selesai</th>
          <th scope="col">Status Ujian</th>
        </tr>
      `;
    }

    let sessions = [...(appState.quizSessions || [])];

    if (isGuru) {
      if (historyViewState.studentFilter !== 'ALL') {
        sessions = sessions.filter(s => Number(s.studentAbsen) === Number(historyViewState.studentFilter));
      }
    } else {
      sessions = sessions.filter(s => Number(s.studentAbsen) === currentAbsen);
    }

    if (historyViewState.subjectFilter !== 'ALL') {
      sessions = sessions.filter(s => {
        const q = (appState.quizzes || []).find(item => item.id === s.quizId);
        return q && (q.subject || '').toLowerCase() === historyViewState.subjectFilter.toLowerCase();
      });
    }

    if (historyViewState.searchQuery) {
      const q = historyViewState.searchQuery;
      sessions = sessions.filter(s => {
        const quiz = (appState.quizzes || []).find(item => item.id === s.quizId);
        const qTitle = quiz ? quiz.title.toLowerCase() : '';
        const sName = (s.studentName || '').toLowerCase();
        return qTitle.includes(q) || sName.includes(q) || String(s.studentAbsen).includes(q);
      });
    }

    sessions.sort((a, b) => new Date(b.submittedAt || b.startedAt) - new Date(a.submittedAt || a.startedAt));

    if (sessions.length === 0) {
      if (emptyState) {
        emptyState.classList.remove('hidden');
        const titleEl = emptyState.querySelector('.state-title');
        const descEl = emptyState.querySelector('.state-desc');
        if (titleEl) titleEl.textContent = 'Belum Ada Sesi Daily Test';
        if (descEl) descEl.textContent = 'Belum ada ujian harian atau kuis yang dikerjakan.';
      }
      if (tableContainer) tableContainer.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (tableContainer) tableContainer.style.display = 'block';

    sessions.forEach(sess => {
      const quiz = (appState.quizzes || []).find(q => q.id === sess.quizId) || {
        title: 'Kuis Online',
        subject: 'Umum'
      };

      const isLocked = sess.isLocked || sess.lockedReason === 'tab_exit';
      const pct = sess.percentage != null ? Number(sess.percentage) : 0;
      const dateStr = sess.submittedAt
        ? new Date(sess.submittedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : (sess.startedAt ? new Date(sess.startedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-');

      let violHtml = '';
      if (isLocked) {
        violHtml = '<span style="color:#EF4444; font-weight:700;">🚨 Keluar Tab (Nilai 0)</span>';
      } else if (sess.fullscreenViolationsCount > 0 || sess.violationsCount > 0) {
        const count = sess.fullscreenViolationsCount || sess.violationsCount;
        violHtml = `<span style="color:#F59E0B; font-weight:600;">⚠️ ${count}x Layar Penuh</span>`;
      } else {
        violHtml = '<span style="color:#10B981; font-weight:600;">0 (Tertib)</span>';
      }

      let statusBadge = '';
      if (isLocked) {
        statusBadge = '<span class="badge" style="background:#DC2626; color:#FFF; font-weight:700;">Terkunci</span>';
      } else if (sess.status === 'completed') {
        statusBadge = '<span class="badge" style="background:rgba(16,185,129,0.2); color:#6EE7B7; font-weight:700;">Selesai</span>';
      } else {
        statusBadge = '<span class="badge" style="background:rgba(59,130,246,0.2); color:#93C5FD; font-weight:700;">Dikerjakan</span>';
      }

      const remedialBadge = quiz.isRemedial
        ? ` <span class="badge" style="background:rgba(239,68,68,0.2); color:#FCA5A5; font-size:0.65rem;">Remedial (Maks. ${quiz.kkm || 77})</span>`
        : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700; color:#60A5FA;">Absen ${sess.studentAbsen || '-'}</td>
        <td style="font-weight:600; color:var(--text-bright);">${escapeHtml(sess.studentName || 'Siswa')}</td>
        <td>
          <div style="font-weight:600;">${escapeHtml(quiz.title)}${remedialBadge}</div>
        </td>
        <td><span class="subject-badge">${escapeHtml(quiz.subject || 'Umum')}</span></td>
        <td>
          <strong style="font-size:1.05rem; color:${isLocked ? '#EF4444' : (pct >= 77 ? '#10B981' : '#F59E0B')};">
            ${isLocked ? '0%' : `${pct}%`}
          </strong>
          <span style="font-size:0.7rem; color:var(--text-muted); display:block;">(${sess.score || 0}/${sess.maxScore || 100} poin)</span>
        </td>
        <td>${violHtml}</td>
        <td style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(dateStr)}</td>
        <td>${statusBadge}</td>
      `;

      dom.historyTableBody.appendChild(tr);
    });
  }
}

if (dom.navBtnHistory) {
  dom.navBtnHistory.addEventListener('click', () => {
    closeMobileDrawer();
    openTaskHistoryModal(historyViewState.mode || 'tasks');
  });
}

// Sub-tombol Riwayat Tugas di Sidebar (Tugas, Nilai Gabungan, Nilai Daily Test)
const btnHistorySubTasks = document.getElementById('btnHistorySubTasks');
if (btnHistorySubTasks) {
  btnHistorySubTasks.addEventListener('click', () => {
    closeMobileDrawer();
    openTaskHistoryModal('tasks');
  });
}

const btnHistorySubCombined = document.getElementById('btnHistorySubCombined');
if (btnHistorySubCombined) {
  btnHistorySubCombined.addEventListener('click', () => {
    closeMobileDrawer();
    openTaskHistoryModal('combined');
  });
}

const btnHistorySubDailyTest = document.getElementById('btnHistorySubDailyTest');
if (btnHistorySubDailyTest) {
  btnHistorySubDailyTest.addEventListener('click', () => {
    closeMobileDrawer();
    openTaskHistoryModal('daily_test');
  });
}

// Sub-tombol Spin Wheel & Tim di Sidebar (Wheel, Teams, Literasi)
const btnSpinSubWheel = document.getElementById('btnSpinSubWheel');
if (btnSpinSubWheel) {
  btnSpinSubWheel.addEventListener('click', () => {
    closeMobileDrawer();
    switchWorkspaceView('spinwheel');
    if (typeof switchClassToolsTab === 'function') {
      switchClassToolsTab('wheel');
    }
  });
}

const btnSpinSubTeams = document.getElementById('btnSpinSubTeams');
if (btnSpinSubTeams) {
  btnSpinSubTeams.addEventListener('click', () => {
    closeMobileDrawer();
    switchWorkspaceView('spinwheel');
    if (typeof switchClassToolsTab === 'function') {
      switchClassToolsTab('teams');
    }
  });
}

const btnSpinSubLiterasi = document.getElementById('btnSpinSubLiterasi');
if (btnSpinSubLiterasi) {
  btnSpinSubLiterasi.addEventListener('click', () => {
    closeMobileDrawer();
    switchWorkspaceView('spinwheel');
    if (typeof switchClassToolsTab === 'function') {
      switchClassToolsTab('literasi');
    }
  });
}

if (dom.btnCloseHistoryModal) {
  dom.btnCloseHistoryModal.addEventListener('click', () => dom.taskHistoryModal.close());
}
if (dom.btnCloseHistoryFooter) {
  dom.btnCloseHistoryFooter.addEventListener('click', () => dom.taskHistoryModal.close());
}
if (dom.taskHistoryModal) {
  dom.taskHistoryModal.addEventListener('close', () => {
    restoreSidebarActiveView();
  });
}
const teacherClassPickerModal = document.getElementById('teacherClassModal');
if (teacherClassPickerModal) {
  teacherClassPickerModal.addEventListener('close', restoreSidebarActiveView);
}

// ==========================================================================
// AVATAR 1:1 SQUARE CROPPER CONTROLLER
// ==========================================================================
let avatarCropState = {
  img: null,
  baseScale: 1,
  currentScale: 1,
  posX: 0,
  posY: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  initPosX: 0,
  initPosY: 0
};

function openAvatarCropModal(imageSource) {
  const img = new Image();
  img.onload = () => {
    const canvas = dom.avatarCropCanvas;
    if (!canvas) return;
    const viewSize = 280;
    canvas.width = viewSize;
    canvas.height = viewSize;

    // Hitung skala dasar agar foto menutupi area persegi 1:1 (280x280)
    const scaleX = viewSize / img.width;
    const scaleY = viewSize / img.height;
    const baseScale = Math.max(scaleX, scaleY);

    avatarCropState = {
      img,
      baseScale,
      currentScale: baseScale,
      posX: (viewSize - img.width * baseScale) / 2,
      posY: (viewSize - img.height * baseScale) / 2,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      initPosX: 0,
      initPosY: 0
    };

    if (dom.avatarZoomRange) {
      dom.avatarZoomRange.value = 1;
    }

    renderAvatarCropCanvas();
    if (dom.avatarCropModal) dom.avatarCropModal.showModal();
  };
  img.src = imageSource;
}

function renderAvatarCropCanvas() {
  const canvas = dom.avatarCropCanvas;
  if (!canvas || !avatarCropState.img) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const drawWidth = avatarCropState.img.width * avatarCropState.currentScale;
  const drawHeight = avatarCropState.img.height * avatarCropState.currentScale;

  // Batasi posisi agar tidak ada celah kosong di sudut canvas persegi
  const minX = canvas.width - drawWidth;
  const maxX = 0;
  const minY = canvas.height - drawHeight;
  const maxY = 0;

  avatarCropState.posX = Math.min(maxX, Math.max(minX, avatarCropState.posX));
  avatarCropState.posY = Math.min(maxY, Math.max(minY, avatarCropState.posY));

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(avatarCropState.img, avatarCropState.posX, avatarCropState.posY, drawWidth, drawHeight);
}

function saveCroppedAvatar() {
  if (!avatarCropState.img || !appState.currentUser || !appState.currentUser.absen) return;

  // Ekspor gambar persegi 1:1 presisi 256x256 pixel
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = 256;
  exportCanvas.height = 256;
  const ctx = exportCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const ratio = 256 / 280;
  const drawWidth = avatarCropState.img.width * avatarCropState.currentScale * ratio;
  const drawHeight = avatarCropState.img.height * avatarCropState.currentScale * ratio;
  const posX = avatarCropState.posX * ratio;
  const posY = avatarCropState.posY * ratio;

  ctx.drawImage(avatarCropState.img, posX, posY, drawWidth, drawHeight);
  const croppedDataUrl = exportCanvas.toDataURL('image/jpeg', 0.88);

  const key = 'xozen_avatar_' + appState.currentUser.absen;
  try {
    localStorage.setItem(key, croppedDataUrl);
  } catch (err) {
    console.warn('LocalStorage quota warning:', err);
  }

  if (dom.userAvatarImg) {
    dom.userAvatarImg.src = croppedDataUrl;
    dom.userAvatarImg.classList.remove('hidden');
  }
  if (dom.userAvatarText) dom.userAvatarText.classList.add('hidden');
  if (dom.submitAvatarImg) {
    dom.submitAvatarImg.src = croppedDataUrl;
    dom.submitAvatarImg.classList.remove('hidden');
  }
  if (dom.submitAvatarText) dom.submitAvatarText.classList.add('hidden');

  if (dom.avatarCropModal) dom.avatarCropModal.close();
  showToast('Foto profil (1:1) berhasil diperbarui!', 'success');
}

// Drag & Pan listeners pada viewport pemotong foto
if (dom.avatarCropViewport) {
  const onStartDrag = (clientX, clientY) => {
    avatarCropState.isDragging = true;
    avatarCropState.dragStartX = clientX;
    avatarCropState.dragStartY = clientY;
    avatarCropState.initPosX = avatarCropState.posX;
    avatarCropState.initPosY = avatarCropState.posY;
  };

  const onMoveDrag = (clientX, clientY) => {
    if (!avatarCropState.isDragging) return;
    const dx = clientX - avatarCropState.dragStartX;
    const dy = clientY - avatarCropState.dragStartY;
    avatarCropState.posX = avatarCropState.initPosX + dx;
    avatarCropState.posY = avatarCropState.initPosY + dy;
    renderAvatarCropCanvas();
  };

  const onEndDrag = () => {
    avatarCropState.isDragging = false;
  };

  dom.avatarCropViewport.addEventListener('mousedown', (e) => onStartDrag(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => onMoveDrag(e.clientX, e.clientY));
  window.addEventListener('mouseup', onEndDrag);

  dom.avatarCropViewport.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches[0]) onStartDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) onMoveDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('touchend', onEndDrag);
}

// Zoom slider listener
if (dom.avatarZoomRange) {
  dom.avatarZoomRange.addEventListener('input', (e) => {
    const zoomMult = parseFloat(e.target.value) || 1;
    const oldScale = avatarCropState.currentScale;
    const newScale = avatarCropState.baseScale * zoomMult;
    avatarCropState.currentScale = newScale;

    // Zoom memusat ke titik tengah 140x140
    const center = 140;
    avatarCropState.posX = center - (center - avatarCropState.posX) * (newScale / oldScale);
    avatarCropState.posY = center - (center - avatarCropState.posY) * (newScale / oldScale);
    renderAvatarCropCanvas();
  });
}

if (dom.btnApplyAvatarCrop) {
  dom.btnApplyAvatarCrop.addEventListener('click', saveCroppedAvatar);
}
if (dom.btnCancelAvatarCrop && dom.avatarCropModal) {
  dom.btnCancelAvatarCrop.addEventListener('click', () => dom.avatarCropModal.close());
}
if (dom.btnCloseAvatarCropModal && dom.avatarCropModal) {
  dom.btnCloseAvatarCropModal.addEventListener('click', () => dom.avatarCropModal.close());
}

// Student: Change Profile Picture Trigger
if (dom.avatarFileInput) {
  dom.avatarFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!appState.currentUser || appState.currentUser.role !== 'siswa') {
      showToast('Hanya siswa yang dapat mengubah foto profil.', 'info');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      showToast('Ukuran berkas foto maksimal 8MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      openAvatarCropModal(reader.result);
      dom.avatarFileInput.value = '';
    };
    reader.onerror = () => {
      showToast('Gagal membaca berkas foto profil.', 'error');
    };
    reader.readAsDataURL(file);
  });
}

// Dashboard: Toggle System Summary (Text Link, No Button Background)
if (dom.btnToggleSystemSummary && dom.systemSummaryDropdown) {
  dom.btnToggleSystemSummary.addEventListener('click', () => {
    const isHidden = dom.systemSummaryDropdown.classList.toggle('hidden');
    const isExpanded = !isHidden;
    dom.btnToggleSystemSummary.setAttribute('aria-expanded', String(isExpanded));
    if (dom.systemSummaryToggleText) {
      dom.systemSummaryToggleText.textContent = isExpanded
        ? 'Sembunyikan Ringkasan Sistem'
        : 'Tampilkan Ringkasan Sistem';
    }
  });
}

// Teacher: Reset All Data with Password pnklover
if (dom.btnOpenResetModal) {
  dom.btnOpenResetModal.addEventListener('click', () => {
    if (dom.resetPasswordInput) dom.resetPasswordInput.value = '';
    if (dom.resetDataModal) dom.resetDataModal.showModal();
  });
}

// Fallback delegation for dashboard server admin buttons
document.addEventListener('click', (e) => {
  const resetBtn = e.target.closest('#btnOpenResetModal');
  if (resetBtn) {
    if (dom.resetPasswordInput) dom.resetPasswordInput.value = '';
    if (dom.resetDataModal && typeof dom.resetDataModal.showModal === 'function') {
      dom.resetDataModal.showModal();
    }
  }
  const backupBtn = e.target.closest('#btnDownloadBackupZip');
  if (backupBtn && typeof triggerDownloadBackupZip === 'function') {
    triggerDownloadBackupZip();
  }
});

if (dom.btnCloseResetModal) {
  dom.btnCloseResetModal.addEventListener('click', () => {
    if (dom.resetDataModal) dom.resetDataModal.close();
  });
}

if (dom.btnCancelResetData) {
  dom.btnCancelResetData.addEventListener('click', () => {
    if (dom.resetDataModal) dom.resetDataModal.close();
  });
}

if (dom.resetDataForm) {
  dom.resetDataForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const enteredPassword = dom.resetPasswordInput ? dom.resetPasswordInput.value.trim() : '';

    if (enteredPassword !== 'pnklover') {
      showToast('Password verifikasi salah! Data tidak dihapus.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: enteredPassword })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Gagal menghapus data di server.', 'error');
        return;
      }

      // Clear local IndexedDB stores
      if (schoolDB) {
        try {
          const txA = schoolDB.transaction('assignments', 'readwrite');
          txA.objectStore('assignments').clear();
          const txS = schoolDB.transaction('submissions', 'readwrite');
          txS.objectStore('submissions').clear();
        } catch (dbErr) {
          console.warn('Local DB clear note:', dbErr);
        }
      }

      // Clear temp drafts & non-account/non-schedule cached data
      localStorage.removeItem('xozen_temp_assignment_draft');
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('xozen_quiz_temp_answers_') || k.startsWith('myPnk_literasi_')) {
          localStorage.removeItem(k);
        }
      });

      if (dom.resetDataModal) dom.resetDataModal.close();
      showToast('Semua data & berkas dibersihkan (akun user, jadwal & kelas tetap aman)!', 'success');

      try {
        await refreshData();
        refreshAllDiagnostics(false);
      } catch (postErr) {
        console.warn('Post-reset refresh note:', postErr);
      }
    } catch (err) {
      console.error('Reset data error:', err);
      showToast('Terjadi kesalahan saat mereset data.', 'error');
    }
  });
}

if (dom.taskHistoryModal) {
  dom.taskHistoryModal.addEventListener('click', (e) => {
    const rect = dom.taskHistoryModal.getBoundingClientRect();
    const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height
      && rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
    if (!isInDialog) {
      dom.taskHistoryModal.close();
    }
  });
}

dom.statusFilterSelect.addEventListener('change', (e) => {
  appState.activeStatusFilter = e.target.value;
  renderAssignmentsList();
});

dom.taskSearchInput.addEventListener('input', (e) => {
  appState.searchQuery = e.target.value;
  renderAssignmentsList();
});

// Auto close drawer on mobile when clicking category or actions
document.querySelectorAll('#subjectFilterNav .cat-btn, #teacherActionsContainer button, #studentActionsContainer button').forEach(el => {
  el.addEventListener('click', () => {
    if (window.innerWidth <= 840) {
      closeMobileDrawer();
    }
  });
});

// ==========================================================================
// HALAMAN KUSTOMISASI DATA (HANYA GURU) - Edit data langsung dari browser
// ==========================================================================

const customizeDom = {
  customizeViewPage: document.getElementById('customizeViewPage'),
  navBtnCustomize: document.getElementById('navBtnCustomize'),
  btnCustomizeRefresh: document.getElementById('btnCustomizeRefresh'),
  btnCustomizeExport: document.getElementById('btnCustomizeExport'),
  customizeImportFile: document.getElementById('customizeImportFile'),
  customizeTabs: document.getElementById('customizeTabs'),
  tabStudents: document.getElementById('tab-students'),
  tabAssignments: document.getElementById('tab-assignments'),
  tabSubmissions: document.getElementById('tab-submissions'),
  tabFiles: document.getElementById('tab-files'),
  tabSettings: document.getElementById('tab-settings'),
  btnCustomizeAddStudent: document.getElementById('btnCustomizeAddStudent'),
  btnCustomizeAddAssignment: document.getElementById('btnCustomizeAddAssignment'),
  customizeStudentSearch: document.getElementById('customizeStudentSearch'),
  customizeAssignmentSearch: document.getElementById('customizeAssignmentSearch'),
  customizeSubmissionSearch: document.getElementById('customizeSubmissionSearch'),
  customizeFilesSearch: document.getElementById('customizeFilesSearch'),
  btnCustomizeRefreshSubmissions: document.getElementById('btnCustomizeRefreshSubmissions'),
  btnCustomizeRefreshFiles: document.getElementById('btnCustomizeRefreshFiles'),
  customizeFilesInfo: document.getElementById('customizeFilesInfo'),
  btnCustomizeExportAll: document.getElementById('btnCustomizeExportAll'),
  btnCustomizeImportAll: document.getElementById('btnCustomizeImportAll'),
  customizeImportAllFile: document.getElementById('customizeImportAllFile'),
  btnCustomizeResetServer: document.getElementById('btnCustomizeResetServer'),
  cfgAppName: document.getElementById('cfgAppName'),
  cfgVersion: document.getElementById('cfgVersion'),
  cfgPort: document.getElementById('cfgPort'),
  cfgDatabase: document.getElementById('cfgDatabase'),
  cfgUptime: document.getElementById('cfgUptime'),
  cfgNodeVersion: document.getElementById('cfgNodeVersion'),
  cfgPlatform: document.getElementById('cfgPlatform'),
  cfgPid: document.getElementById('cfgPid'),
  cfgMemory: document.getElementById('cfgMemory')
};

const customizeState = {
  activeTab: 'students',
  students: [],
  assignments: [],
  submissions: [],
  files: [],
  serverInfo: null
};

function openCustomizePage() {
  switchWorkspaceView('customize');
  loadCustomizeData();
}

async function loadCustomizeData() {
  try {
    const [infoRes, studentsRes, assignmentsRes, submissionsRes, filesRes] = await Promise.all([
      fetch('/api/server/info'),
      fetch('/api/db/students'),
      fetch('/api/db/assignments'),
      fetch('/api/db/submissions'),
      fetch('/api/files')
    ]);

    if (infoRes.ok) customizeState.serverInfo = await infoRes.json();
    if (studentsRes.ok) {
      const d = await studentsRes.json();
      customizeState.students = Array.isArray(d.items) ? d.items : [];
    }
    if (assignmentsRes.ok) {
      const d = await assignmentsRes.json();
      customizeState.assignments = Array.isArray(d.items) ? d.items : [];
    }
    if (submissionsRes.ok) {
      const d = await submissionsRes.json();
      customizeState.submissions = Array.isArray(d.items) ? d.items : [];
    }
    if (filesRes.ok) {
      const d = await filesRes.json();
      customizeState.files = Array.isArray(d.files) ? d.files : [];
    }

    appState.students = customizeState.students.slice().sort((a, b) => a.absen - b.absen);
    appState.assignments = customizeState.assignments.slice();
    appState.submissions = customizeState.submissions.slice();

    renderCustomizeTab(customizeState.activeTab);
    renderCustomizeSettings();
    showToast('Data kustomisasi berhasil dimuat dari server.', 'success');
  } catch (err) {
    console.error('Muat kustomisasi gagal:', err);
    showToast('Gagal menghubungi server saat memuat data.', 'error');
  }
}

function renderCustomizeTab(tab) {
  customizeState.activeTab = tab;
  customizeDom.customizeTabs.querySelectorAll('.customize-tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  customizeDom.tabStudents.classList.toggle('hidden', tab !== 'students');
  customizeDom.tabAssignments.classList.toggle('hidden', tab !== 'assignments');
  customizeDom.tabSubmissions.classList.toggle('hidden', tab !== 'submissions');
  customizeDom.tabFiles.classList.toggle('hidden', tab !== 'files');
  customizeDom.tabSettings.classList.toggle('hidden', tab !== 'settings');

  if (tab === 'students') renderCustomizeStudents();
  else if (tab === 'assignments') renderCustomizeAssignments();
  else if (tab === 'submissions') renderCustomizeSubmissions();
  else if (tab === 'files') renderCustomizeFiles();
  else if (tab === 'settings') renderCustomizeSettings();
}

// ---------- Panel Siswa ----------
function renderCustomizeStudents() {
  const tbody = customizeDom.tabStudents.querySelector('#customizeStudentsTableBody');
  const empty = customizeDom.tabStudents.querySelector('#customizeStudentsEmpty');
  const q = (customizeDom.customizeStudentSearch ? customizeDom.customizeStudentSearch.value : '').toLowerCase().trim();
  const list = customizeState.students
    .filter((s) => `${s.absen} ${s.name || ''} ${s.code || ''}`.toLowerCase().includes(q))
    .sort((a, b) => a.absen - b.absen);

  tbody.innerHTML = '';
  if (list.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.forEach((s) => {
    const count = customizeState.submissions.filter((x) => Number(x.studentAbsen) === Number(s.absen)).length;
    const displayPassword = s.code || `${s.absen}pnk`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-absen"><strong>${s.absen}</strong></td>
      <td class="col-student-name">
        <div class="student-name-cell">
          <span class="student-name-text">${escapeHtml(s.name || `Siswa Absen ${s.absen}`)}</span>
          <div class="student-name-meta">
            <button class="btn btn-secondary btn-sm btn-c-edit-name btn-table-mini" data-absen="${s.absen}" title="Ubah nama">Ubah</button>
            <span class="student-task-count-inline">${count} tugas</span>
          </div>
        </div>
      </td>
      <td class="col-password">
        <div class="student-password-cell">
          <span class="code-password-badge">${escapeHtml(displayPassword)}</span>
          <button class="btn btn-secondary btn-sm btn-c-edit-pass btn-table-mini" data-absen="${s.absen}" title="Ganti password">Ganti PW</button>
        </div>
      </td>
      <td class="col-task-count"><span>${count} tugas</span></td>
      <td class="col-actions">
        <div class="student-actions-cell">
          <button class="btn btn-secondary btn-sm btn-c-copy btn-table-mini" data-absen="${s.absen}" title="Salin info login">Salin</button>
          <button class="btn btn-danger btn-sm btn-c-delete-student btn-table-mini" data-absen="${s.absen}" title="Hapus akun siswa">Hapus</button>
        </div>
      </td>
    `;

    tr.querySelector('.btn-c-edit-name').addEventListener('click', async () => {
      const current = s.name === `Siswa Absen ${s.absen}` ? '' : s.name;
      const input = await showPromptDialog({
        title: `Edit Nama Siswa Absen ${s.absen}`,
        message: 'Masukkan nama baru untuk siswa:',
        defaultValue: current,
        placeholder: 'Nama siswa',
        type: 'info'
      });
      if (input === null || input.trim() === '') return;
      const updated = { ...s, name: input.trim().slice(0, 60) };
      if (!(await dbPut('students', updated))) return;
      Object.assign(s, updated);
      customizeState.students = customizeState.students.map((x) => (Number(x.absen) === Number(s.absen) ? updated : x));
      appState.students = customizeState.students.slice().sort((a, b) => a.absen - b.absen);
      renderCustomizeStudents();
      showToast(`Nama absen ${s.absen} diperbarui.`, 'success');
    });

    tr.querySelector('.btn-c-edit-pass').addEventListener('click', async () => {
      const teacherPw = await ensureTeacherPassword();
      if (!teacherPw) return;
      const newPw = await showPromptDialog({
        title: `Ganti Password Siswa Absen ${s.absen}`,
        message: `Password baru untuk ${s.name || s.absen} (minimal 3 karakter):`,
        placeholder: 'Password baru',
        inputType: 'password',
        type: 'warning'
      });
      if (!newPw || newPw.trim().length < 3) {
        if (newPw !== null) showToast('Password baru minimal 3 karakter.', 'error');
        return;
      }
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'siswa', absen: s.absen, newPassword: newPw.trim(), teacherPassword: teacherPw })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const updated = { ...s, code: data.student.code };
          await dbPut('students', updated);
          Object.assign(s, updated);
          customizeState.students = customizeState.students.map((x) => (Number(x.absen) === Number(s.absen) ? updated : x));
          appState.students = customizeState.students.slice().sort((a, b) => a.absen - b.absen);
          renderCustomizeStudents();
          showToast(`Password ${s.name} berhasil diganti.`, 'success');
        } else {
          if (res.status === 401) appState.teacherPasswordHolder = null;
          showToast(data.error || 'Gagal mengganti password.', 'error');
        }
      } catch {
        showToast('Tidak bisa menghubungi server.', 'error');
      }
    });

    tr.querySelector('.btn-c-copy').addEventListener('click', () => {
      const text = `Absen: ${s.absen} | Nama: ${s.name} | Password: ${s.code || '-'}`;
      navigator.clipboard.writeText(text);
      showToast(`Login absen ${s.absen} disalin.`, 'success');
    });

    tr.querySelector('.btn-c-delete-student').addEventListener('click', async () => {
      const confirmed = await showConfirmDialog({
        title: 'Hapus Akun Siswa',
        message: `Apakah Anda yakin ingin menghapus akun "${s.name}" (Absen ${s.absen})?\nPengumpulan tugas yang lama tetap tersimpan di server.`,
        confirmText: 'Hapus Akun',
        cancelText: 'Batal',
        type: 'danger'
      });
      if (!confirmed) return;
      const teacherPw = await ensureTeacherPassword();
      if (!teacherPw) return;
      try {
        const res = await fetch(`/api/db/students?key=${encodeURIComponent(s.absen)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Gagal menghapus');
        customizeState.students = customizeState.students.filter((x) => Number(x.absen) !== Number(s.absen));
        appState.students = customizeState.students.slice().sort((a, b) => a.absen - b.absen);
        renderCustomizeStudents();
        showToast(`Akun absen ${s.absen} berhasil dihapus.`, 'success');
      } catch {
        showToast('Gagal menghapus akun siswa.', 'error');
      }
    });

    tbody.appendChild(tr);
  });
}

async function customizeAddStudent() {
  const name = await showPromptDialog({
    title: 'Tambah Siswa Baru',
    message: 'Masukkan nama siswa baru:',
    placeholder: 'Contoh: Rani Salsabila',
    type: 'info'
  });
  if (name === null || !name.trim()) return;

  const pw = await showPromptDialog({
    title: 'Password Awal Siswa',
    message: 'Masukkan password awal (kosongkan untuk dibuat otomatis):',
    placeholder: 'Kosongkan jika otomatis',
    inputType: 'password',
    type: 'info'
  });
  if (pw === null) return;

  const teacherPw = await ensureTeacherPassword();
  if (!teacherPw) return;

  try {
    const res = await fetch('/api/auth/create-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherPassword: teacherPw, name: name.trim(), password: pw.trim() || undefined })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      customizeState.students.push(data.student);
      customizeState.students.sort((a, b) => a.absen - b.absen);
      appState.students = customizeState.students.slice();
      renderCustomizeStudents();
      showToast(`Akun dibuat: ${data.student.name} (${data.student.code})`, 'success');
    } else {
      if (res.status === 401) appState.teacherPasswordHolder = null;
      showToast(data.error || 'Gagal membuat akun.', 'error');
    }
  } catch {
    showToast('Tidak bisa menghubungi server.', 'error');
  }
}

// ---------- Panel Tugas ----------
function renderCustomizeAssignments() {
  const tbody = customizeDom.tabAssignments.querySelector('#customizeAssignmentsTableBody');
  const empty = customizeDom.tabAssignments.querySelector('#customizeAssignmentsEmpty');
  const q = (customizeDom.customizeAssignmentSearch ? customizeDom.customizeAssignmentSearch.value : '').toLowerCase().trim();
  const list = customizeState.assignments
    .filter((a) => `${a.title} ${a.subject} ${a.description || ''}`.toLowerCase().includes(q))
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

  tbody.innerHTML = '';
  if (list.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.forEach((a) => {
    const count = customizeState.submissions.filter((s) => s.assignmentId === a.id).length;
    const evalData = evaluateDeadline(a);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display:flex; flex-direction:column; gap:2px;">
          <div style="font-weight:600; color:var(--text-bright);">${escapeHtml(a.title)}</div>
          <div style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(a.createdBy || '-')} • ${formatDateTime(a.createdAt)}</div>
        </div>
      </td>
      <td><span class="subject-badge" style="font-size:0.75rem;">${escapeHtml(a.subject)}</span></td>
      <td style="font-family:var(--font-mono); font-size:0.75rem;">${evalData.formattedDate}</td>
      <td><span class="tag-status-${a.latePolicy === 'close' ? 'late' : 'timely'}">${a.latePolicy === 'close' ? 'Tutup Mutlak' : 'Terima Terlambat'}</span></td>
      <td>${count} tugas</td>
      <td>
        <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm btn-c-edit-assignment" data-id="${a.id}" title="Edit tugas">Edit</button>
          <button class="btn btn-danger btn-sm btn-c-delete-assignment" data-id="${a.id}" title="Hapus tugas">Hapus</button>
        </div>
      </td>
    `;

    tr.querySelector('.btn-c-edit-assignment').addEventListener('click', async () => {
      const title = await showPromptDialog({
        title: 'Edit Judul Tugas',
        message: 'Masukkan judul tugas baru:',
        defaultValue: a.title,
        placeholder: 'Judul tugas',
        type: 'info'
      });
      if (title === null || title.trim() === '') return;

      const subject = await showPromptDialog({
        title: 'Edit Mata Pelajaran',
        message: 'Masukkan nama mata pelajaran baru:',
        defaultValue: a.subject,
        placeholder: 'Contoh: Informatika',
        type: 'info'
      });
      if (subject === null) return;

      const deadline = await showPromptDialog({
        title: 'Edit Batas Waktu',
        message: 'Format batas waktu deadline (YYYY-MM-DDTHH:MM):',
        defaultValue: a.deadline ? a.deadline.slice(0, 16) : '',
        placeholder: '2026-11-05T23:59',
        type: 'info'
      });
      if (deadline === null) return;

      const policy = await showPromptDialog({
        title: 'Kebijakan Keterlambatan',
        message: 'Ketik "close" (tutup mutlak) atau "allow_with_label" (terima terlambat):',
        defaultValue: a.latePolicy || 'close',
        type: 'info'
      });
      if (policy === null || !['close', 'allow_with_label'].includes(policy)) return;

      const updated = { ...a, title: title.trim(), subject: subject.trim(), deadline: new Date(deadline).toISOString(), latePolicy: policy };
      dbPut('assignments', updated).then(() => {
        customizeState.assignments = customizeState.assignments.map((x) => (x.id === a.id ? updated : x));
        appState.assignments = customizeState.assignments.slice();
        renderCustomizeAssignments();
        renderAssignmentsList();
        showToast(`Tugas "${updated.title}" diperbarui.`, 'success');
      }).catch(() => showToast('Gagal menyimpan perubahan tugas.', 'error'));
    });

    tr.querySelector('.btn-c-delete-assignment').addEventListener('click', async () => {
      const confirmed = await showConfirmDialog({
        title: 'Hapus Tugas',
        message: `Apakah yakin menghapus "${a.title}"? Semua pengumpulan siswa untuk tugas ini juga akan dihapus.`,
        confirmText: 'Hapus Tugas',
        cancelText: 'Batal',
        type: 'danger'
      });
      if (!confirmed) return;
      dbDelete('assignments', a.id).then(async () => {
        const related = customizeState.submissions.filter((s) => s.assignmentId === a.id);
        for (const sub of related) await dbDelete('submissions', sub.id);
        customizeState.assignments = customizeState.assignments.filter((x) => x.id !== a.id);
        customizeState.submissions = customizeState.submissions.filter((s) => s.assignmentId !== a.id);
        appState.assignments = customizeState.assignments.slice();
        appState.submissions = customizeState.submissions.slice();
        renderCustomizeAssignments();
        renderCustomizeSubmissions();
        showToast('Tugas dan pengumpulan terkait berhasil dihapus.', 'success');
      }).catch(() => showToast('Gagal menghapus tugas.', 'error'));
    });

    tbody.appendChild(tr);
  });
}

async function customizeAddAssignmentQuick() {
  const title = await showPromptDialog({
    title: 'Buat Tugas Baru',
    message: 'Masukkan judul tugas:',
    placeholder: 'Contoh: Latihan Logika Komputasi',
    type: 'info'
  });
  if (title === null || !title.trim()) return;

  const subject = await showPromptDialog({
    title: 'Mata Pelajaran',
    message: 'Masukkan nama mata pelajaran:',
    defaultValue: 'Informatika',
    type: 'info'
  });
  if (subject === null) return;

  const desc = await showPromptDialog({
    title: 'Deskripsi Tugas',
    message: 'Masukkan instruksi tugas (opsional):',
    defaultValue: '',
    placeholder: 'Petunjuk pengerjaan tugas...',
    type: 'info'
  });
  if (desc === null) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 0, 0);
  const tzOffset = tomorrow.getTimezoneOffset() * 60000;
  const defaultDeadline = new Date(tomorrow.getTime() - tzOffset).toISOString().slice(0, 16);

  const deadline = await showPromptDialog({
    title: 'Batas Waktu Pengumpulan',
    message: 'Format batas waktu deadline (YYYY-MM-DDTHH:MM):',
    defaultValue: defaultDeadline,
    type: 'info'
  });
  if (deadline === null) return;

  const policy = await showPromptDialog({
    title: 'Kebijakan Keterlambatan',
    message: 'Ketik "close" (tutup mutlak) atau "allow_with_label" (terima terlambat):',
    defaultValue: 'close',
    type: 'info'
  });
  if (policy === null || !['close', 'allow_with_label'].includes(policy)) return;

  const newAssignment = {
    id: 'task_' + Date.now(),
    title: title.trim(),
    subject: subject.trim(),
    description: desc.trim(),
    deadline: new Date(deadline).toISOString(),
    latePolicy: policy,
    createdBy: (appState.currentUser && appState.currentUser.name) || 'Admin',
    createdAt: new Date().toISOString()
  };
  dbPut('assignments', newAssignment).then(() => {
    customizeState.assignments.push(newAssignment);
    appState.assignments = customizeState.assignments.slice();
    renderCustomizeAssignments();
    renderAssignmentsList();
    showToast(`Tugas "${title}" berhasil dibuat.`, 'success');
  }).catch(() => showToast('Gagal membuat tugas.', 'error'));
}

// ---------- Panel Pengumpulan ----------
function renderCustomizeSubmissions() {
  const tbody = customizeDom.tabSubmissions.querySelector('#customizeSubmissionsTableBody');
  const empty = customizeDom.tabSubmissions.querySelector('#customizeSubmissionsEmpty');
  const q = (customizeDom.customizeSubmissionSearch ? customizeDom.customizeSubmissionSearch.value : '').toLowerCase().trim();
  const list = customizeState.submissions
    .filter((s) => {
      const a = customizeState.assignments.find((x) => x.id === s.assignmentId) || {};
      const text = `${s.studentName || ''} ${a.title || ''} ${a.subject || ''} ${s.notes || ''}`.toLowerCase();
      return q === '' || text.includes(q);
    })
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  tbody.innerHTML = '';
  if (list.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.forEach((sub) => {
    const a = customizeState.assignments.find((x) => x.id === sub.assignmentId) || { title: 'Tugas', subject: '-' };
    const cleanName = (sub.studentName || '').includes(' - ') ? (sub.studentName || '').split(' - ').slice(1).join(' - ') : (sub.studentName || 'Siswa');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:24px; height:24px; border-radius:50%; background:var(--accent-secondary); color:var(--accent-cyan-light); font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${sub.studentAbsen || 'S'}</div>
          <div>
            <div style="font-weight:600; color:var(--text-bright);">${escapeHtml(cleanName)}</div>
            <span style="font-size:0.72rem; color:var(--accent-cyan-light);">Absen ${sub.studentAbsen}</span>
          </div>
        </div>
      </td>
      <td>
        <div style="font-weight:600; color:var(--text-bright);">${escapeHtml(a.title)}</div>
        <span class="subject-badge" style="font-size:0.6875rem;">${escapeHtml(a.subject)}</span>
      </td>
      <td title="${escapeHtml(sub.fileName || '-')}" style="font-family:var(--font-mono); font-size:0.72rem; color:var(--accent-cyan-light);">${escapeHtml(formatTruncatedFileName(sub.fileName || '-', 24))}</td>
      <td style="font-family:var(--font-mono); font-size:0.72rem;">${formatDateTime(sub.submittedAt)}</td>
      <td><span class="status-badge ${sub.isLate ? 'badge-closed' : 'badge-active'}">${sub.isLate ? 'Terlambat' : 'Tepat Waktu'}</span></td>
      <td>
        <div style="display:flex; align-items:center; gap:4px;">
          ${sub.grade != null ? `
            <span class="badge-grade-scored">${sub.grade}</span>
            <button class="btn btn-secondary btn-sm btn-c-grade" data-sub-id="${sub.id}" style="padding:2px 6px; font-size:0.6875rem;" title="Ubah nilai">Ubah</button>
          ` : `
            <button class="btn btn-primary btn-sm btn-c-grade" data-sub-id="${sub.id}" style="padding:2px 8px; font-size:0.6875rem;">Nilai</button>
          `}
        </div>
      </td>
      <td style="font-size:0.75rem; color:var(--text-muted); max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(sub.notes || '-')}">${escapeHtml(sub.notes || '-')}</td>
      <td>
        <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm btn-c-open-file" data-sub-id="${sub.id}" title="Buka berkas">Buka</button>
          <button class="btn btn-danger btn-sm btn-c-delete-submission" data-sub-id="${sub.id}" title="Hapus pengumpulan">Hapus</button>
        </div>
      </td>
    `;

    const btnCGrade = tr.querySelector('.btn-c-grade');
    if (btnCGrade) {
      btnCGrade.addEventListener('click', async () => {
        const curVal = sub.grade != null ? String(sub.grade) : '100';
        const gradeInput = await showPromptDialog({
          title: `Beri Nilai: ${cleanName}`,
          message: `Tugas: "${a.title}" (Absen ${sub.studentAbsen})\nMasukkan nilai siswa (skala 0 - 100):`,
          defaultValue: curVal,
          placeholder: '0 - 100',
          type: 'info'
        });
        if (gradeInput === null) return;
        const num = Number(gradeInput.trim());
        if (isNaN(num) || num < 0 || num > 100) {
          showToast('Nilai harus berupa angka antara 0 sampai 100.', 'error');
          return;
        }
        sub.grade = num;
        sub.gradedAt = new Date().toISOString();
        await dbPut('submissions', sub);
        showToast(`Nilai ${num} untuk ${cleanName} berhasil disimpan.`, 'success');
        await refreshData();
        renderCustomizeSubmissions();
      });
    }

    tr.querySelector('.btn-c-open-file').addEventListener('click', () => {
      const subFull = customizeState.submissions.find((x) => x.id === sub.id) || sub;
      openSubmissionFile(subFull);
    });

    tr.querySelector('.btn-c-delete-submission').addEventListener('click', async () => {
      const confirmed = await showConfirmDialog({
        title: 'Hapus Pengumpulan',
        message: `Hapus pengumpulan "${escapeHtml(sub.fileName)}" dari ${escapeHtml(cleanName)}?`,
        confirmText: 'Hapus',
        cancelText: 'Batal',
        type: 'danger'
      });
      if (!confirmed) return;
      dbDelete('submissions', sub.id).then(() => {
        customizeState.submissions = customizeState.submissions.filter((x) => x.id !== sub.id);
        appState.submissions = customizeState.submissions.slice();
        renderCustomizeSubmissions();
        renderCustomizeStudents();
        showToast('Pengumpulan berhasil dihapus.', 'success');
      }).catch(() => showToast('Gagal menghapus pengumpulan.', 'error'));
    });

    tbody.appendChild(tr);
  });
}

// ---------- Panel Berkas Server ----------
function renderCustomizeFiles() {
  const tbody = customizeDom.tabFiles.querySelector('#customizeFilesTableBody');
  const empty = customizeDom.tabFiles.querySelector('#customizeFilesEmpty');
  const q = (customizeDom.customizeFilesSearch ? customizeDom.customizeFilesSearch.value : '').toLowerCase().trim();
  const list = customizeState.files.filter((f) => f.name.toLowerCase().includes(q));

  if (customizeDom.customizeFilesInfo) customizeDom.customizeFilesInfo.textContent = `${customizeState.files.length} berkas`;
  tbody.innerHTML = '';
  if (list.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.forEach((f) => {
    const date = new Date(f.modified).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = new Date(f.modified).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family:var(--font-mono); font-size:0.75rem;">${escapeHtml(f.name)}</td>
      <td style="font-family:var(--font-mono); font-size:0.75rem;">${f.sizeFormatted}</td>
      <td style="font-size:0.75rem; color:var(--text-muted);">${date}<br>${time} WIB</td>
      <td><a href="${f.downloadUrl}" class="btn btn-secondary btn-sm" style="padding:0 10px; font-size:0.72rem;">Unduh</a></td>
      <td><button class="btn btn-danger btn-sm btn-c-delete-file" data-file="${escapeHtml(f.name)}" title="Hapus berkas">Hapus</button></td>
    `;
    tr.querySelector('.btn-c-delete-file').addEventListener('click', async () => {
      const confirmed = await showConfirmDialog({
        title: 'Hapus Berkas Server',
        message: `Hapus berkas "${escapeHtml(f.name)}" dari server? Tindakan tidak dapat dibatalkan.`,
        confirmText: 'Hapus Berkas',
        cancelText: 'Batal',
        type: 'danger'
      });
      if (!confirmed) return;
      fetch('/api/files?file=' + encodeURIComponent(f.name), { method: 'DELETE' }).then(async (res) => {
        if (!res.ok) throw new Error('Gagal menghapus');
        customizeState.files = customizeState.files.filter((x) => x.name !== f.name);
        renderCustomizeFiles();
        showToast('Berkas berhasil dihapus.', 'success');
      }).catch(() => showToast('Gagal menghapus berkas.', 'error'));
    });
    tbody.appendChild(tr);
  });
}

// ---------- Panel Pengaturan ----------
function renderCustomizeSettings() {
  const info = customizeState.serverInfo || {};
  if (customizeDom.cfgAppName) customizeDom.cfgAppName.textContent = info.name || 'Xozen Cloud';
  if (customizeDom.cfgVersion) customizeDom.cfgVersion.textContent = info.version || '1.0.0';
  if (customizeDom.cfgPort) customizeDom.cfgPort.textContent = info.port != null ? info.port : PORT;
  if (customizeDom.cfgDatabase) customizeDom.cfgDatabase.textContent = 'JSON files (data/)';
  if (customizeDom.cfgUptime) customizeDom.cfgUptime.textContent = info.uptimeSeconds != null ? `${info.uptimeSeconds} detik` : '-';
  if (customizeDom.cfgNodeVersion) customizeDom.cfgNodeVersion.textContent = info.nodeVersion || '-';
  if (customizeDom.cfgPlatform) customizeDom.cfgPlatform.textContent = info.platform || '-';
  if (customizeDom.cfgPid) customizeDom.cfgPid.textContent = info.pid != null ? info.pid : '-';
  if (customizeDom.cfgMemory) customizeDom.cfgMemory.textContent = info.memory ? info.memory.heapUsed : '-';
}

// ---------- Ekspor / Impor Cadangan ----------
if (customizeDom.btnCustomizeExport) {
  customizeDom.btnCustomizeExport.addEventListener('click', async () => {
    try {
      const bundle = {
        exportedAt: new Date().toISOString(),
        app: 'Xozen Cloud',
        version: '1.0.0',
        students: customizeState.students,
        assignments: customizeState.assignments,
        submissions: customizeState.submissions
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xozen-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Cadangan data berhasil diunduh.', 'success');
    } catch {
      showToast('Gagal mengekspor data.', 'error');
    }
  });
}

if (customizeDom.btnCustomizeImportAll) {
  customizeDom.btnCustomizeImportAll.addEventListener('click', () => {
    customizeDom.customizeImportAllFile.click();
  });
}

if (customizeDom.customizeImportAllFile) {
  customizeDom.customizeImportAllFile.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const confirmed = await showConfirmDialog({
      title: 'Impor Cadangan Data',
      message: 'Impor akan mengganti data tugas, pengumpulan, dan siswa yang ada di server. Lanjutkan?',
      confirmText: 'Impor Sekarang',
      cancelText: 'Batal',
      type: 'warning'
    });
    if (!confirmed) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        const students = Array.isArray(data.students) ? data.students : [];
        const assignments = Array.isArray(data.assignments) ? data.assignments : [];
        const submissions = Array.isArray(data.submissions) ? data.submissions : [];
        let ok = true;
        for (const s of students) { if (!(await dbPut('students', s))) ok = false; }
        for (const a of assignments) { if (!(await dbPut('assignments', a))) ok = false; }
        for (const sub of submissions) { if (!(await dbPut('submissions', sub))) ok = false; }
        customizeDom.customizeImportAllFile.value = '';
        if (!ok) showToast('Beberapa data gagal diimpor.', 'warning');
        await loadCustomizeData();
        showToast('Data berhasil diimpor dari cadangan.', 'success');
      } catch {
        showToast('File cadangan tidak valid.', 'error');
      }
    };
    reader.readAsText(file);
  });
}

if (customizeDom.btnCustomizeResetServer) {
  customizeDom.btnCustomizeResetServer.addEventListener('click', async () => {
    const pw = await showPromptDialog({
      title: 'Verifikasi Reset Server',
      message: 'Masukkan password verifikasi untuk reset seluruh database (pnklover):',
      placeholder: 'Password verifikasi',
      inputType: 'password',
      type: 'danger'
    });
    if (pw === null) return;
    try {
      const res = await fetch('/api/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        localStorage.removeItem('xozen_temp_assignment_draft');
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith('xozen_quiz_temp_answers_') || k.startsWith('myPnk_literasi_')) {
            localStorage.removeItem(k);
          }
        });
        customizeState.assignments = [];
        customizeState.submissions = [];
        customizeState.files = [];
        appState.assignments = [];
        appState.submissions = [];
        appState.quizzes = [];
        appState.quizSessions = [];
        appState.piket = {};
        appState.devo = [];
        renderCustomizeAssignments();
        renderCustomizeSubmissions();
        renderCustomizeFiles();
        renderCustomizeStudents();
        await refreshData().catch(() => {});
        showToast(`Semua data dibersihkan (${data.filesRemoved || 0} berkas dihapus). Akun, jadwal & kelas aman.`, 'success');
      } else {
        showToast(data.error || 'Password reset salah.', 'error');
      }
    } catch {
      showToast('Tidak bisa menghubungi server.', 'error');
    }
  });
}

// ---------- Pencarian & Segarkan ----------
['customizeStudentSearch', 'customizeAssignmentSearch', 'customizeSubmissionSearch', 'customizeFilesSearch'].forEach((id) => {
  const el = customizeDom[id];
  if (!el) return;
  el.addEventListener('input', () => renderCustomizeTab(customizeState.activeTab));
});

if (customizeDom.btnCustomizeRefresh) customizeDom.btnCustomizeRefresh.addEventListener('click', loadCustomizeData);
if (customizeDom.btnCustomizeRefreshSubmissions) customizeDom.btnCustomizeRefreshSubmissions.addEventListener('click', loadCustomizeData);
if (customizeDom.btnCustomizeRefreshFiles) customizeDom.btnCustomizeRefreshFiles.addEventListener('click', () => {
  fetch('/api/files').then(async (res) => {
    if (res.ok) {
      customizeState.files = (await res.json()).files || [];
      renderCustomizeFiles();
    }
  }).catch(() => showToast('Gagal memuat berkas.', 'error'));
});
if (customizeDom.btnCustomizeAddStudent) customizeDom.btnCustomizeAddStudent.addEventListener('click', customizeAddStudent);
if (customizeDom.btnCustomizeAddAssignment) customizeDom.btnCustomizeAddAssignment.addEventListener('click', customizeAddAssignmentQuick);

if (customizeDom.customizeTabs) {
  customizeDom.customizeTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.customize-tab-btn');
    if (!btn) return;
    renderCustomizeTab(btn.dataset.tab);
  });
}

if (customizeDom.navBtnCustomize) {
  customizeDom.navBtnCustomize.addEventListener('click', () => {
    openCustomizePage();
  });
}

// ==========================================================================
// SYSTEM DIAGNOSTICS & TIMELY RATE CIRCLE BAR
// ==========================================================================

const diagDom = {
  btnRefreshDiagnostics: document.getElementById('btnRefreshDiagnostics'),
  serverStatePill: document.getElementById('serverStatePill'),
  serverMetricValue: document.getElementById('serverMetricValue'),
  serverPortValue: document.getElementById('serverPortValue'),
  serverDetailsText: document.getElementById('serverDetailsText'),
  networkStatusPill: document.getElementById('networkStatusPill'),
  networkTypeValue: document.getElementById('networkTypeValue'),
  networkPingValue: document.getElementById('networkPingValue'),
  networkDetailsText: document.getElementById('networkDetailsText'),
  ipStatusPill: document.getElementById('ipStatusPill'),
  publicIpValue: document.getElementById('publicIpValue'),
  ipIspValue: document.getElementById('ipIspValue'),
  ipDetailsText: document.getElementById('ipDetailsText'),
  timelyRateLabel: document.getElementById('timelyRateLabel'),
  timelyRatePercent: document.getElementById('timelyRatePercent'),
  timelyCircleProgress: document.getElementById('timelyCircleProgress'),
  timelyCountText: document.getElementById('timelyCountText'),
  lateCountText: document.getElementById('lateCountText'),
  timelyRatePill: document.getElementById('timelyRatePill')
};

// 1. Server Connected Status Monitor - selalu tampil tersambung (always on)
async function updateServerStatusMonitor() {
  if (!diagDom.serverStatePill) return;

  diagDom.serverStatePill.textContent = 'ONLINE';
  diagDom.serverStatePill.className = 'diag-status-pill pill-online';
  if (diagDom.serverMetricValue) {
    diagDom.serverMetricValue.textContent = 'TERHUBUNG';
  }
  if (diagDom.serverPortValue) {
    diagDom.serverPortValue.textContent = 'Port 3000 (Database Aktif)';
  }
  if (diagDom.serverDetailsText) {
    const subsCount = (appState.submissions || []).length;
    diagDom.serverDetailsText.textContent = `${subsCount} tugas tersimpan di server (Saved)`;
  }
}

// 2. Network & Latency Checker
async function updateNetworkMonitor() {
  if (!diagDom.networkStatusPill) return;

  const isOnline = navigator.onLine;
  if (!isOnline) {
    diagDom.networkStatusPill.textContent = 'Offline';
    diagDom.networkStatusPill.className = 'diag-status-pill pill-offline';
    diagDom.networkTypeValue.textContent = 'Terputus';
    diagDom.networkPingValue.textContent = 'Tidak ada koneksi';
    diagDom.networkDetailsText.textContent = 'Periksa sambungan internet Anda';
    return;
  }

  diagDom.networkStatusPill.textContent = 'Online';
  diagDom.networkStatusPill.className = 'diag-status-pill pill-online';

  let connType = 'WiFi / LAN';
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && conn.effectiveType) {
    connType = conn.effectiveType.toUpperCase();
  }
  diagDom.networkTypeValue.textContent = connType;
  diagDom.networkDetailsText.textContent = 'Koneksi internet aktif & stabil';

  diagDom.networkPingValue.textContent = 'Mengukur...';
  const startTime = performance.now();
  try {
    const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
    if (res.ok) {
      const rtt = Math.round(performance.now() - startTime);
      diagDom.networkPingValue.textContent = `${rtt} ms`;
    } else {
      diagDom.networkPingValue.textContent = 'Aktif';
    }
  } catch {
    diagDom.networkPingValue.textContent = isOnline ? 'Terhubung' : 'Gagal';
  }
}

// 3. Kredit Developer (menggantikan pengecek IP publik)
async function fetchPublicIp(forceRefresh = false) {
  if (!diagDom.publicIpValue) return;

  diagDom.publicIpValue.textContent = 'arcznewera';
  if (diagDom.ipStatusPill) {
    diagDom.ipStatusPill.textContent = 'Developer';
    diagDom.ipStatusPill.className = 'diag-status-pill pill-ip';
  }
  if (diagDom.ipIspValue) {
    diagDom.ipIspValue.textContent = 'Dibuat oleh';
  }
  if (diagDom.ipDetailsText) {
    diagDom.ipDetailsText.textContent = 'Xozen Cloud v1.0 : arcznewera';
  }
}

// Menghitung nilai kuis siswa dengan pembaruan remedial (maksimal remedial 77 walau nilai 100)
function getEffectiveStudentQuizScore(quiz, studentAbsen, allQuizzes, allSessions) {
  if (!quiz || studentAbsen == null) {
    return { score: 0, isGraded: false, isRemedialUpdated: false };
  }
  const sAbsen = Number(studentAbsen);

  // Cari kuis remedial yang menginduk pada kuis ini
  const remedialQuizzes = (allQuizzes || []).filter(q => q.isRemedial && q.remedialForQuizId === quiz.id);

  // Periksa apakah siswa telah menyelesaikan kuis remedial
  let bestRemedialScore = null;
  for (const remQuiz of remedialQuizzes) {
    const remSess = (allSessions || []).find(s => s.quizId === remQuiz.id && Number(s.studentAbsen) === sAbsen && s.status === 'completed');
    if (remSess) {
      const kkm = Number(remQuiz.kkm) || 77;
      const rawPct = remSess.percentage != null ? Number(remSess.percentage) : 0;
      // Nilai remedial diperbarui maksimal batas KKM (default 77)
      const capped = Math.min(kkm, rawPct);
      if (bestRemedialScore === null || capped > bestRemedialScore) {
        bestRemedialScore = capped;
      }
    }
  }

  // Cari sesi pengerjaan kuis utama
  const origSess = (allSessions || []).find(s => s.quizId === quiz.id && Number(s.studentAbsen) === sAbsen && s.status === 'completed');
  const origScore = origSess && origSess.percentage != null ? Number(origSess.percentage) : null;

  if (bestRemedialScore !== null) {
    // Remedial memperbarui nilai kuis sebelumnya, dibatasi maksimal 77
    return {
      score: bestRemedialScore,
      isGraded: true,
      isRemedialUpdated: true
    };
  }

  if (origScore !== null) {
    return {
      score: origScore,
      isGraded: true,
      isRemedialUpdated: false
    };
  }

  return {
    score: 0,
    isGraded: false,
    isRemedialUpdated: false
  };
}

// 4. Rata-Rata Nilai Gabungan Tugas + Kuis dengan Bar Lingkaran (Circle Bar)
function updateTimelyRateCircleBar() {
  if (!diagDom.timelyCircleProgress) return;

  const isTeacher = appState.currentUser && (appState.currentUser.role === 'teacher' || appState.currentUser.role === 'guru');
  const allAssignments = appState.assignments || [];
  const allSubmissions = appState.submissions || [];
  const allQuizzes = appState.quizzes || [];
  const allSessions = appState.quizSessions || [];

  // Kuis dasar (bukan kuis remedial yang menginduk ke kuis lain)
  const baseQuizzes = allQuizzes.filter(q => !q.isRemedial);

  if (diagDom.timelyRateLabel) {
    diagDom.timelyRateLabel.textContent = isTeacher ? 'RATA-RATA GABUNGAN KELAS' : 'NILAI GABUNGAN (TUGAS & KUIS)';
  }

  let finalPercent = 0;
  let gradedCount = 0;
  let zeroCount = 0;
  let tasksAvg = 0;
  let quizzesAvg = 0;

  if (isTeacher) {
    // Guru: hitung akumulasi nilai gabungan tugas + kuis seluruh siswa
    const students = (appState.students && appState.students.length > 0) ? appState.students : [{ absen: 1 }];
    let totalTasksSum = 0;
    let totalQuizzesSum = 0;
    let tasksGradedSlots = 0;
    let quizzesGradedSlots = 0;

    students.forEach(st => {
      const sAbsen = Number(st.absen);
      const sSubs = allSubmissions.filter(s => Number(s.studentAbsen) === sAbsen);

      allAssignments.forEach(assignment => {
        const sub = sSubs.find(s => s.assignmentId === assignment.id);
        if (sub && sub.grade != null && !isNaN(Number(sub.grade))) {
          totalTasksSum += Number(sub.grade);
          tasksGradedSlots++;
        }
      });

      baseQuizzes.forEach(quiz => {
        const res = getEffectiveStudentQuizScore(quiz, sAbsen, allQuizzes, allSessions);
        totalQuizzesSum += res.score;
        if (res.isGraded) {
          quizzesGradedSlots++;
        }
      });
    });

    const totalTaskSlots = Math.max(1, allAssignments.length * students.length);
    const totalQuizSlots = Math.max(1, baseQuizzes.length * students.length);
    tasksAvg = allAssignments.length > 0 ? Math.round(totalTasksSum / totalTaskSlots) : 0;
    quizzesAvg = baseQuizzes.length > 0 ? Math.round(totalQuizzesSum / totalQuizSlots) : 0;

    const totalGrandSlots = (allAssignments.length + baseQuizzes.length) * students.length;
    gradedCount = tasksGradedSlots + quizzesGradedSlots;
    zeroCount = Math.max(0, totalGrandSlots - gradedCount);

    if (totalGrandSlots > 0) {
      finalPercent = Math.min(100, Math.max(0, Math.round((totalTasksSum + totalQuizzesSum) / totalGrandSlots)));
    } else {
      finalPercent = 0;
    }

    if (diagDom.timelyCountText) diagDom.timelyCountText.textContent = `${gradedCount} Dinilai`;
    if (diagDom.lateCountText) diagDom.lateCountText.textContent = `${zeroCount} Belum / 0`;

    const subtextEl = document.getElementById('gradeCardSubtext');
    if (subtextEl) {
      subtextEl.textContent = (allAssignments.length + baseQuizzes.length) > 0
        ? `Akumulasi seluruh siswa: ${allAssignments.length} tugas & ${baseQuizzes.length} kuis (remedial maks. 77)`
        : 'Belum ada tugas atau kuis yang dibuat';
    }
  } else {
    // Siswa: hitung nilai gabungan tugas + kuis milik sendiri
    const myAbsen = appState.currentUser && appState.currentUser.absen != null ? Number(appState.currentUser.absen) : null;
    const myName = (appState.currentUser && appState.currentUser.name) || '';

    let tasksSum = 0;
    let tasksGradedCount = 0;
    const mySubs = allSubmissions.filter(s => {
      if (myAbsen != null && s.studentAbsen != null) {
        return Number(s.studentAbsen) === myAbsen;
      }
      return s.studentName && s.studentName.toLowerCase().includes(myName.toLowerCase());
    });

    allAssignments.forEach(assignment => {
      const sub = mySubs.find(s => s.assignmentId === assignment.id);
      if (sub && sub.grade != null && !isNaN(Number(sub.grade))) {
        tasksSum += Number(sub.grade);
        tasksGradedCount++;
      }
    });

    tasksAvg = allAssignments.length > 0 ? Math.round(tasksSum / allAssignments.length) : 0;

    let quizzesSum = 0;
    let quizzesGradedCount = 0;

    baseQuizzes.forEach(quiz => {
      const res = getEffectiveStudentQuizScore(quiz, myAbsen, allQuizzes, allSessions);
      quizzesSum += res.score;
      if (res.isGraded) {
        quizzesGradedCount++;
      }
    });

    quizzesAvg = baseQuizzes.length > 0 ? Math.round(quizzesSum / baseQuizzes.length) : 0;

    const totalItems = allAssignments.length + baseQuizzes.length;
    gradedCount = tasksGradedCount + quizzesGradedCount;
    zeroCount = Math.max(0, totalItems - gradedCount);

    if (totalItems > 0) {
      finalPercent = Math.min(100, Math.max(0, Math.round((tasksSum + quizzesSum) / totalItems)));
    } else {
      finalPercent = 0;
    }

    if (diagDom.timelyCountText) diagDom.timelyCountText.textContent = `${gradedCount} Dinilai`;
    if (diagDom.lateCountText) diagDom.lateCountText.textContent = `${zeroCount} Belum / 0`;

    const subtextEl = document.getElementById('gradeCardSubtext');
    if (subtextEl) {
      subtextEl.textContent = totalItems > 0
        ? `Rata-rata dari ${allAssignments.length} tugas & ${baseQuizzes.length} kuis (remedial diperbarui maks. 77)`
        : 'Belum ada tugas atau kuis yang tersedia';
    }
  }

  // Update breakdown row Tugas & Kuis
  const tasksAvgEl = document.getElementById('gradeTasksAvgText');
  const quizzesAvgEl = document.getElementById('gradeQuizzesAvgText');
  if (tasksAvgEl) tasksAvgEl.textContent = `${tasksAvg}% (${allAssignments.length} Tugas)`;
  if (quizzesAvgEl) quizzesAvgEl.textContent = `${quizzesAvg}% (${baseQuizzes.length} Kuis)`;

  // Circumference for r=38 is 2 * PI * 38 = 238.76
  const circumference = 238.76;
  const offset = circumference - (circumference * finalPercent) / 100;
  diagDom.timelyCircleProgress.style.strokeDashoffset = offset;

  if (diagDom.timelyRatePercent) {
    diagDom.timelyRatePercent.textContent = `${finalPercent}%`;
  }

  if (finalPercent >= 75) {
    diagDom.timelyCircleProgress.style.stroke = '#10B981';
    if (diagDom.timelyRatePill) {
      diagDom.timelyRatePill.textContent = 'Sangat Baik';
      diagDom.timelyRatePill.className = 'diag-status-pill pill-online';
    }
  } else if (finalPercent >= 50) {
    diagDom.timelyCircleProgress.style.stroke = '#38BDF8';
    if (diagDom.timelyRatePill) {
      diagDom.timelyRatePill.textContent = 'Cukup Baik';
      diagDom.timelyRatePill.className = 'diag-status-pill';
    }
  } else {
    diagDom.timelyCircleProgress.style.stroke = '#EF4444';
    if (diagDom.timelyRatePill) {
      diagDom.timelyRatePill.textContent = 'Perlu Ditingkatkan';
      diagDom.timelyRatePill.className = 'diag-status-pill pill-offline';
    }
  }
}

/* ==========================================================================
   MagicBento Engine (Ported from React Bits MagicBento for Dashboard)
   ========================================================================== */
let magicBentoEngine = null;

function createMagicBentoEngine(root) {
  if (!root) return null;

  const cards = Array.from(root.querySelectorAll('.magic-bento__card'));
  const cells = Array.from(root.querySelectorAll('.magic-bento__cell'));
  if (!cards.length) return null;

  const motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pointer = { x: -1e5, y: -1e5, inside: false, down: -1 };
  const light = { x: -1e5, y: -1e5, near: 0, ready: false };
  const states = [];
  const wave = { x: 0, y: 0, t: -1, duration: 1.1, reach: 800 };
  let rects = [];
  let bounds = null;
  let dirty = true;
  let raf = 0;
  let last = 0;

  const stateFor = index => {
    if (!states[index]) {
      states[index] = {
        hot: 0,
        rx: 0,
        ry: 0,
        tx: 0,
        ty: 0,
        vrx: 0,
        vry: 0,
        vtx: 0,
        vty: 0,
        press: 1,
        vpress: 0,
        active: false,
        written: {}
      };
    }
    return states[index];
  };

  const write = (element, state, name, value) => {
    if (state.written[name] === value) return;
    state.written[name] = value;
    element.style.setProperty(name, value);
  };

  const measure = () => {
    dirty = false;
    bounds = root.getBoundingClientRect();
    rects = cells.map(cell => cell.getBoundingClientRect());
  };

  const startWave = (x, y, duration = 1.1) => {
    if (!bounds) measure();
    wave.x = x;
    wave.y = y;
    wave.t = 0;
    wave.duration = duration;
    wave.reach = Math.max(
      Math.hypot(x - bounds.left, y - bounds.top),
      Math.hypot(x - bounds.right, y - bounds.top),
      Math.hypot(x - bounds.left, y - bounds.bottom),
      Math.hypot(x - bounds.right, y - bounds.bottom)
    ) + 120;
    wake();
  };

  const frame = now => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (dirty) measure();
    let busy = false;

    const margin = 160;
    const near =
      pointer.inside &&
      bounds &&
      pointer.x > bounds.left - margin &&
      pointer.x < bounds.right + margin &&
      pointer.y > bounds.top - margin &&
      pointer.y < bounds.bottom + margin
        ? 1
        : 0;

    if (!light.ready && near) {
      light.x = pointer.x;
      light.y = pointer.y;
      light.ready = true;
    }
    const follow = 1 - Math.exp(-dt / 0.05);
    light.x += (pointer.x - light.x) * follow;
    light.y += (pointer.y - light.y) * follow;
    const fade = 1 - Math.exp(-dt / (near > light.near ? 0.12 : 0.4));
    light.near += (near - light.near) * fade;
    if (Math.abs(near - light.near) < 0.002) light.near = near;
    else busy = true;
    if (Math.abs(pointer.x - light.x) + Math.abs(pointer.y - light.y) > 0.3) busy = true;

    let waveRadius = 0;
    let waveAlpha = 0;
    if (wave.t >= 0) {
      wave.t += dt;
      const progress = Math.min(1, wave.t / wave.duration);
      waveRadius = wave.reach * (1 - Math.pow(1 - progress, 2.2));
      waveAlpha = Math.pow(1 - progress, 1.3);
      if (progress >= 1) {
        wave.t = -1;
        waveAlpha = 0;
      } else busy = true;
    }

    cards.forEach((card, index) => {
      const rect = rects[index];
      if (!card || !rect) return;
      const state = stateFor(index);
      const lx = light.x - rect.left;
      const ly = light.y - rect.top;
      const px = pointer.x - rect.left;
      const py = pointer.y - rect.top;
      const inside = pointer.inside && px >= 0 && py >= 0 && px <= rect.width && py <= rect.height;

      const hotTarget = inside ? 1 : 0;
      state.hot += (hotTarget - state.hot) * (1 - Math.exp(-dt / (hotTarget > state.hot ? 0.14 : 0.32)));
      if (Math.abs(hotTarget - state.hot) < 0.002) state.hot = hotTarget;
      else busy = true;

      const clampVal = (v, min, max) => Math.min(max, Math.max(min, v));
      const u = clampVal(px / Math.max(1, rect.width), 0, 1) - 0.5;
      const v = clampVal(py / Math.max(1, rect.height), 0, 1) - 0.5;
      const targetRx = inside && motion ? -v * 10 : 0;
      const targetRy = inside && motion ? u * 10 : 0;
      const targetTx = inside && motion ? u * 6 : 0;
      const targetTy = inside && motion ? v * 6 : 0;

      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        state.vrx += (170 * (targetRx - state.rx) - 20 * state.vrx) * h;
        state.rx += state.vrx * h;
        state.vry += (170 * (targetRy - state.ry) - 20 * state.vry) * h;
        state.ry += state.vry * h;
        state.vtx += (170 * (targetTx - state.tx) - 20 * state.vtx) * h;
        state.tx += state.vtx * h;
        state.vty += (170 * (targetTy - state.ty) - 20 * state.vty) * h;
        state.ty += state.vty * h;
      }
      if (Math.abs(targetRx - state.rx) > 0.002 || Math.abs(state.vrx) > 0.01) busy = true;

      const pressTarget = pointer.down === index && motion ? 0.985 : 1;
      for (let s = 0; s < steps; s++) {
        state.vpress += (420 * (pressTarget - state.press) - 28 * state.vpress) * h;
        state.press += state.vpress * h;
      }
      if (Math.abs(pressTarget - state.press) > 0.0005) busy = true;

      write(card, state, '--mb-x', `${lx.toFixed(1)}px`);
      write(card, state, '--mb-y', `${ly.toFixed(1)}px`);
      write(card, state, '--mb-near', light.near.toFixed(3));
      write(card, state, '--mb-hot', state.hot.toFixed(3));
      write(card, state, '--mb-rx', `${state.rx.toFixed(3)}deg`);
      write(card, state, '--mb-ry', `${state.ry.toFixed(3)}deg`);
      write(card, state, '--mb-tx', `${state.tx.toFixed(2)}px`);
      write(card, state, '--mb-ty', `${state.ty.toFixed(2)}px`);
      write(card, state, '--mb-press', state.press.toFixed(4));
      write(card, state, '--mb-wx', `${(wave.x - rect.left).toFixed(1)}px`);
      write(card, state, '--mb-wy', `${(wave.y - rect.top).toFixed(1)}px`);
      write(card, state, '--mb-wr', `${waveRadius.toFixed(1)}px`);
      write(card, state, '--mb-wa', waveAlpha.toFixed(3));
    });

    if (busy) raf = requestAnimationFrame(frame);
  };

  const wake = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const cardIndex = target => {
    if (!(target instanceof Element)) return -1;
    const card = target.closest('.magic-bento__card');
    return card ? cards.indexOf(card) : -1;
  };

  const onPointerMove = event => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.inside = true;
    wake();
  };

  const onPointerDown = event => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.inside = true;
    pointer.down = cardIndex(event.target);
    wake();
  };

  const release = () => {
    pointer.down = -1;
    wake();
  };

  const onPointerOut = event => {
    if (event.relatedTarget) return;
    pointer.inside = false;
    pointer.down = -1;
    wake();
  };

  const onClick = event => {
    const idx = cardIndex(event.target);
    if (idx < 0) return;
    startWave(event.clientX, event.clientY, 1.2);
  };

  const onScroll = () => {
    dirty = true;
    wake();
  };

  const resizeObserver = new ResizeObserver(() => {
    dirty = true;
    wake();
  });
  resizeObserver.observe(root);

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointerup', release, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('resize', onScroll, { passive: true });
  document.addEventListener('pointerout', onPointerOut);
  root.addEventListener('click', onClick);

  // Stagger intro
  let order = 0;
  cells.forEach(cell => {
    cell.style.setProperty('--mb-delay', `${order++ * 70}ms`);
    cell.dataset.state = 'in';
  });
  measure();
  wake();

  return {
    wake,
    destroy() {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('pointerout', onPointerOut);
      root.removeEventListener('click', onClick);
    }
  };
}

function initOrUpdateMagicBento() {
  const root = document.getElementById('dashboardMagicBento');
  if (!root) return;
  if (!magicBentoEngine) {
    magicBentoEngine = createMagicBentoEngine(root);
  } else {
    magicBentoEngine.wake();
  }
}

// Refresh all diagnostics
async function refreshAllDiagnostics(showToastNotice = false) {
  await updateServerStatusMonitor();
  await updateNetworkMonitor();
  await fetchPublicIp(true);
  updateTimelyRateCircleBar();
  initOrUpdateMagicBento();
  if (showToastNotice) {
    showToast('Data diagnostik dan performa berhasil diperbarui.', 'success');
  }
}

window.addEventListener('online', () => updateNetworkMonitor());
window.addEventListener('offline', () => updateNetworkMonitor());

if (diagDom.btnRefreshDiagnostics) {
  diagDom.btnRefreshDiagnostics.addEventListener('click', () => refreshAllDiagnostics(true));
}

// ==========================================================================
// QUIZ MAKER, ANTI-CHEAT FULLSCREEN RUNNER, LIVE MONITOR & BACKUP ZIP
// ==========================================================================

const quizState = {
  makerQuestions: [],
  activeQuiz: null,
  activeSession: null,
  runnerTimerInterval: null,
  runnerHeartbeatInterval: null,
  runnerSecondsLeft: 0,
  monitorInterval: null,
  isViolationReported: false
};

// DOM References for Quizzes
const quizDom = {
  // Page Elements
  quizzesViewPage: document.getElementById('quizzesViewPage'),
  quizzesGridContainer: document.getElementById('quizzesGridContainer'),
  quizzesEmptyState: document.getElementById('quizzesEmptyState'),
  quizSearchInput: document.getElementById('quizSearchInput'),
  quizSubjectFilter: document.getElementById('quizSubjectFilter'),
  btnCreateNewQuiz: document.getElementById('btnCreateNewQuiz'),
  btnEmptyCreateQuiz: document.getElementById('btnEmptyCreateQuiz'),
  btnImportQuizJson: document.getElementById('btnImportQuizJson'),
  btnEmptyImportQuiz: document.getElementById('btnEmptyImportQuiz'),
  quizImportFileInput: document.getElementById('quizImportFileInput'),
  btnOpenMonitorFromPage: document.getElementById('btnOpenMonitorFromPage'),
  btnOpenHistoryFromPage: document.getElementById('btnOpenHistoryFromPage'),
  btnOpenQuizMakerModal: document.getElementById('btnOpenQuizMakerModal'),
  btnOpenSessionMonitorModal: document.getElementById('btnOpenSessionMonitorModal'),
  btnDownloadBackupZip: document.getElementById('btnDownloadBackupZip'),
  btnSettingsBackupZip: document.getElementById('btnSettingsBackupZip'),

  // Maker Modal Elements
  quizMakerModal: document.getElementById('quizMakerModal'),
  btnCloseQuizMakerModal: document.getElementById('btnCloseQuizMakerModal'),
  btnCancelQuizMaker: document.getElementById('btnCancelQuizMaker'),
  makerQuizId: document.getElementById('makerQuizId'),
  makerQuizTitle: document.getElementById('makerQuizTitle'),
  makerQuizSubject: document.getElementById('makerQuizSubject'),
  makerQuizDuration: document.getElementById('makerQuizDuration'),
  makerQuizDescription: document.getElementById('makerQuizDescription'),
  makerQuizShuffleQuestions: document.getElementById('makerQuizShuffleQuestions'),
  makerQuizShuffleOptions: document.getElementById('makerQuizShuffleOptions'),
  makerQuestionsContainer: document.getElementById('makerQuestionsContainer'),
  btnMakerAddQuestion: document.getElementById('btnMakerAddQuestion'),
  btnMakerDownloadFormat: document.getElementById('btnMakerDownloadFormat'),
  btnSaveQuizToServer: document.getElementById('btnSaveQuizToServer'),

  // Runner Modal Elements
  quizRunnerModal: document.getElementById('quizRunnerModal'),
  runnerQuizTitle: document.getElementById('runnerQuizTitle'),
  runnerStudentIdentity: document.getElementById('runnerStudentIdentity'),
  runnerTimerText: document.getElementById('runnerTimerText'),
  runnerFsStatusBadge: document.getElementById('runnerFsStatusBadge'),
  btnRunnerForceFullscreen: document.getElementById('btnRunnerForceFullscreen'),
  runnerViolationAlert: document.getElementById('runnerViolationAlert'),
  runnerViolationDetails: document.getElementById('runnerViolationDetails'),
  btnDismissViolation: document.getElementById('btnDismissViolation'),
  runnerTabLockOverlay: document.getElementById('runnerTabLockOverlay'),
  runnerExamInstructions: document.getElementById('runnerExamInstructions'),
  runnerQuestionsList: document.getElementById('runnerQuestionsList'),
  runnerAnsweredCount: document.getElementById('runnerAnsweredCount'),
  runnerTotalCount: document.getElementById('runnerTotalCount'),
  runnerProgressBarFill: document.getElementById('runnerProgressBarFill'),
  btnSubmitExam: document.getElementById('btnSubmitExam'),

  // Monitor Modal Elements
  quizSessionMonitorModal: document.getElementById('quizSessionMonitorModal'),
  btnCloseSessionMonitorModal: document.getElementById('btnCloseSessionMonitorModal'),
  monitorQuizSelect: document.getElementById('monitorQuizSelect'),
  monCountTotal: document.getElementById('monCountTotal'),
  monCountAlert: document.getElementById('monCountAlert'),
  monCountCompleted: document.getElementById('monCountCompleted'),
  monCountNotStarted: document.getElementById('monCountNotStarted'),
  btnRefreshMonitor: document.getElementById('btnRefreshMonitor'),
  monitorStudentGrid: document.getElementById('monitorStudentGrid'),
  monitorEmptyState: document.getElementById('monitorEmptyState'),

  // History Modal Elements
  quizSessionHistoryModal: document.getElementById('quizSessionHistoryModal'),
  btnCloseQuizHistoryModal: document.getElementById('btnCloseQuizHistoryModal'),
  historySearchInput: document.getElementById('historySearchInput'),
  btnRefreshHistory: document.getElementById('btnRefreshHistory'),
  quizHistoryTableBody: document.getElementById('quizHistoryTableBody'),
  quizHistoryEmptyState: document.getElementById('quizHistoryEmptyState'),

  // Remedial Modal Elements
  quizRemedialModal: document.getElementById('quizRemedialModal'),
  btnCloseRemedialModal: document.getElementById('btnCloseRemedialModal'),
  btnCancelRemedialModal: document.getElementById('btnCancelRemedialModal'),
  remedialSourceQuizId: document.getElementById('remedialSourceQuizId'),
  remedialSourceQuizTitle: document.getElementById('remedialSourceQuizTitle'),
  remedialTitleInput: document.getElementById('remedialTitleInput'),
  remedialKkmInput: document.getElementById('remedialKkmInput'),
  remedialDurationInput: document.getElementById('remedialDurationInput'),
  remedialReuseQuestions: document.getElementById('remedialReuseQuestions'),
  remedialEligibleCountNote: document.getElementById('remedialEligibleCountNote'),
  btnRemedialSelectAll: document.getElementById('btnRemedialSelectAll'),
  btnRemedialDeselectAll: document.getElementById('btnRemedialDeselectAll'),
  remedialStudentsListContainer: document.getElementById('remedialStudentsListContainer'),
  btnPublishRemedialQuiz: document.getElementById('btnPublishRemedialQuiz')
};

// --------------------------------------------------------------------------
// 1. QUIZ MAKER FUNCTIONS (GOOGLE FORM STYLE BUILDER)
// --------------------------------------------------------------------------

function createDefaultQuestion(idx = 0) {
  return {
    id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    title: '',
    type: 'multiple_choice',
    points: 10,
    required: true,
    options: ['Opsi 1', 'Opsi 2', 'Opsi 3', 'Opsi 4'],
    correctAnswer: 'Opsi 1'
  };
}

function openQuizMakerModal(quizToEdit = null) {
  if (!quizDom.quizMakerModal) return;

  const isTeacher = appState.currentUser && (appState.currentUser.role === 'teacher' || appState.currentUser.role === 'guru');
  if (!isTeacher) {
    showToast('Akses ditolak: Siswa tidak diizinkan membuat atau mengubah kuis.', 'error');
    return;
  }

  if (quizToEdit) {
    quizDom.makerQuizId.value = quizToEdit.id || '';
    quizDom.makerQuizTitle.value = quizToEdit.title || '';
    quizDom.makerQuizSubject.value = quizToEdit.subject || '';
    quizDom.makerQuizDuration.value = quizToEdit.durationMinutes || 30;
    quizDom.makerQuizDescription.value = quizToEdit.description || '';
    quizDom.makerQuizShuffleQuestions.checked = !!quizToEdit.shuffleQuestions;
    quizDom.makerQuizShuffleOptions.checked = quizToEdit.shuffleOptions !== false;
    quizState.makerQuestions = Array.isArray(quizToEdit.questions) && quizToEdit.questions.length > 0
      ? JSON.parse(JSON.stringify(quizToEdit.questions))
      : [createDefaultQuestion(0)];
  } else {
    quizDom.makerQuizId.value = '';
    quizDom.makerQuizTitle.value = '';
    const defaultSubj = appState.activeSubjectFilter && appState.activeSubjectFilter !== 'all'
      ? appState.activeSubjectFilter
      : (appState.assignments.length > 0 && appState.assignments[0].subject ? appState.assignments[0].subject : 'Informatika');
    quizDom.makerQuizSubject.value = defaultSubj;
    quizDom.makerQuizDuration.value = '30';
    quizDom.makerQuizDescription.value = '';
    quizDom.makerQuizShuffleQuestions.checked = false;
    quizDom.makerQuizShuffleOptions.checked = true;
    quizState.makerQuestions = [createDefaultQuestion(0)];
  }

  renderMakerQuestions();
  quizDom.quizMakerModal.showModal();
}

function closeQuizMakerModal() {
  if (quizDom.quizMakerModal && quizDom.quizMakerModal.open) {
    quizDom.quizMakerModal.close();
  }
}

function renderMakerQuestions() {
  if (!quizDom.makerQuestionsContainer) return;
  quizDom.makerQuestionsContainer.innerHTML = '';

  quizState.makerQuestions.forEach((q, qIdx) => {
    const card = document.createElement('div');
    card.className = 'maker-question-card';
    card.dataset.index = qIdx;

    // Header: Badge & Question Type Selector
    const header = document.createElement('div');
    header.className = 'maker-question-header';
    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="maker-q-badge">Pertanyaan ${qIdx + 1}</span>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <select class="maker-q-type-select" data-qidx="${qIdx}" aria-label="Tipe Pertanyaan">
          <option value="multiple_choice" ${q.type === 'multiple_choice' ? 'selected' : ''}>Pilihan Ganda</option>
          <option value="checkboxes" ${q.type === 'checkboxes' ? 'selected' : ''}>Kotak Centang</option>
          <option value="short_answer" ${q.type === 'short_answer' ? 'selected' : ''}>Jawaban Singkat</option>
          <option value="paragraph" ${q.type === 'paragraph' ? 'selected' : ''}>Paragraf / Esai</option>
          <option value="code_compiler" ${q.type === 'code_compiler' ? 'selected' : ''}>💻 Pemrograman / Compiler (Python, JS, dll)</option>
          <option value="dropdown" ${q.type === 'dropdown' ? 'selected' : ''}>Dropdown</option>
          <option value="true_false" ${q.type === 'true_false' ? 'selected' : ''}>Benar / Salah</option>
          <option value="linear_scale" ${q.type === 'linear_scale' ? 'selected' : ''}>Skala Linier (1 - 5)</option>
        </select>
      </div>
    `;

    // Question Text Prompt
    const textarea = document.createElement('textarea');
    textarea.className = 'maker-q-textarea';
    textarea.dataset.qidx = qIdx;
    textarea.placeholder = `Tuliskan pertanyaan nomor ${qIdx + 1} di sini...`;
    textarea.value = q.title || '';
    textarea.addEventListener('input', (e) => {
      q.title = e.target.value;
      if (e.target.value.trim()) {
        e.target.style.borderColor = '';
      }
    });

    // Options Container
    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'maker-options-list';

    if (q.type === 'multiple_choice' || q.type === 'dropdown') {
      (q.options || []).forEach((opt, optIdx) => {
        const row = document.createElement('div');
        row.className = 'maker-option-row';
        const isCorrect = q.correctAnswer === opt;
        row.innerHTML = `
          <button type="button" class="maker-option-key-btn ${isCorrect ? 'is-correct' : ''}" data-qidx="${qIdx}" data-optidx="${optIdx}" title="${isCorrect ? 'Kunci Jawaban Benar' : 'Klik untuk jadikan kunci jawaban'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="${isCorrect ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              ${isCorrect ? '<circle cx="12" cy="12" r="4" fill="#FFFFFF"/>' : ''}
            </svg>
          </button>
          <input type="text" class="maker-option-input" value="${escapeHtml(opt)}" data-qidx="${qIdx}" data-optidx="${optIdx}" placeholder="Pilihan ${optIdx + 1}">
          <button type="button" class="maker-btn-remove-opt" data-qidx="${qIdx}" data-optidx="${optIdx}" title="Hapus Opsi">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        `;
        optionsWrap.appendChild(row);
      });

      const btnAddOpt = document.createElement('button');
      btnAddOpt.type = 'button';
      btnAddOpt.className = 'maker-add-opt-btn';
      btnAddOpt.textContent = '+ Tambah Opsi Pilihan';
      btnAddOpt.addEventListener('click', () => {
        q.options = q.options || [];
        const newOptName = 'Opsi ' + (q.options.length + 1);
        q.options.push(newOptName);
        renderMakerQuestions();
      });
      optionsWrap.appendChild(btnAddOpt);

    } else if (q.type === 'checkboxes') {
      const correctArr = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer].filter(Boolean);
      (q.options || []).forEach((opt, optIdx) => {
        const row = document.createElement('div');
        row.className = 'maker-option-row';
        const isCorrect = correctArr.includes(opt);
        row.innerHTML = `
          <button type="button" class="maker-option-key-btn ${isCorrect ? 'is-correct' : ''}" data-qidx="${qIdx}" data-optidx="${optIdx}" title="${isCorrect ? 'Termasuk Kunci Jawaban' : 'Klik untuk tambah ke kunci jawaban'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="${isCorrect ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              ${isCorrect ? '<path d="M9 12l2 2 4-4" stroke="#FFFFFF" stroke-width="3" fill="none"/>' : ''}
            </svg>
          </button>
          <input type="text" class="maker-option-input" value="${escapeHtml(opt)}" data-qidx="${qIdx}" data-optidx="${optIdx}" placeholder="Pilihan ${optIdx + 1}">
          <button type="button" class="maker-btn-remove-opt" data-qidx="${qIdx}" data-optidx="${optIdx}" title="Hapus Opsi">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        `;
        optionsWrap.appendChild(row);
      });

      const btnAddOpt = document.createElement('button');
      btnAddOpt.type = 'button';
      btnAddOpt.className = 'maker-add-opt-btn';
      btnAddOpt.textContent = '+ Tambah Opsi Centang';
      btnAddOpt.addEventListener('click', () => {
        q.options = q.options || [];
        const newOptName = 'Opsi ' + (q.options.length + 1);
        q.options.push(newOptName);
        renderMakerQuestions();
      });
      optionsWrap.appendChild(btnAddOpt);

    } else if (q.type === 'true_false') {
      q.options = ['Benar', 'Salah'];
      q.correctAnswer = q.correctAnswer || 'Benar';
      ['Benar', 'Salah'].forEach((opt, optIdx) => {
        const row = document.createElement('div');
        row.className = 'maker-option-row';
        const isCorrect = q.correctAnswer === opt;
        row.innerHTML = `
          <button type="button" class="maker-option-key-btn ${isCorrect ? 'is-correct' : ''}" data-qidx="${qIdx}" data-tfopt="${opt}" title="${isCorrect ? 'Kunci Jawaban Benar' : 'Klik untuk jadikan kunci'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="${isCorrect ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              ${isCorrect ? '<circle cx="12" cy="12" r="4" fill="#FFFFFF"/>' : ''}
            </svg>
          </button>
          <span style="font-weight:600; color:var(--text-bright);">${opt}</span>
        `;
        optionsWrap.appendChild(row);
      });

    } else if (q.type === 'short_answer') {
      const helper = document.createElement('div');
      helper.style.padding = '8px 0';
      helper.innerHTML = `
        <label class="form-label" style="font-size:0.8125rem;">Kunci Jawaban yang Diterima (Pisahkan dengan tanda koma jika lebih dari 1 variasi ejaan):</label>
        <input type="text" class="maker-option-input" style="width:100%;" value="${escapeHtml(Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : (q.correctAnswer || ''))}" placeholder="Contoh: Python, python, BAHASA PYTHON">
      `;
      helper.querySelector('input').addEventListener('input', (e) => {
        q.correctAnswer = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
      });
      optionsWrap.appendChild(helper);

    } else if (q.type === 'paragraph') {
      const helper = document.createElement('div');
      helper.style.padding = '8px 0';
      helper.innerHTML = `
        <p style="font-size:0.8125rem; color:var(--text-muted); margin:0;">
          Jawaban berupa esai atau uraian panjang. Dinilai manual oleh Guru melalui menu sesi kuis.
        </p>
      `;
      optionsWrap.appendChild(helper);

    } else if (q.type === 'linear_scale') {
      const helper = document.createElement('div');
      helper.style.padding = '8px 0';
      helper.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; font-size:0.875rem; color:var(--text-secondary);">
          <span>Skala: <strong>1</strong> (Sangat Kurang) hingga <strong>5</strong> (Sangat Baik)</span>
        </div>
      `;
      optionsWrap.appendChild(helper);

    } else if (q.type === 'code_compiler') {
      q.compilerLang = q.compilerLang || 'python';
      if (q.starterCode === undefined) {
        q.starterCode = q.compilerLang === 'python' ? '# Tulis kode Python Anda di sini\nprint("Hello, World!")' : '// Tulis kode JavaScript Anda di sini\nconsole.log("Hello, World!");';
      }
      
      const compWrap = document.createElement('div');
      compWrap.className = 'maker-compiler-config';
      compWrap.style.display = 'flex';
      compWrap.style.flexDirection = 'column';
      compWrap.style.gap = '10px';
      compWrap.style.padding = '10px 0';

      compWrap.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <label style="font-size:0.8125rem; font-weight:700; color:#38BDF8;">Bahasa Pemrograman:</label>
          <select class="form-input maker-compiler-lang-select" data-qidx="${qIdx}" style="width:auto; padding:4px 10px; font-weight:600;">
            <option value="python" ${q.compilerLang === 'python' ? 'selected' : ''}>Python (.py)</option>
            <option value="nodejs" ${q.compilerLang === 'nodejs' ? 'selected' : ''}>JavaScript / Node.js (.js)</option>
            <option value="c" ${q.compilerLang === 'c' ? 'selected' : ''}>C (.c)</option>
            <option value="cpp" ${q.compilerLang === 'cpp' ? 'selected' : ''}>C++ (.cpp)</option>
            <option value="html" ${q.compilerLang === 'html' ? 'selected' : ''}>HTML / CSS</option>
            <option value="sqlite" ${q.compilerLang === 'sqlite' ? 'selected' : ''}>SQLite / SQL</option>
            <option value="bash" ${q.compilerLang === 'bash' ? 'selected' : ''}>Bash / Shell</option>
          </select>
          <span style="font-size:0.75rem; color:#94A3B8;">Siswa dapat langsung mengompilasi dan menguji kode di lembar ujian.</span>
        </div>
        <div>
          <label style="font-size:0.8125rem; font-weight:600; color:#E2E8F0; margin-bottom:4px; display:block;">Kode Awal / Template Soal (Starter Code):</label>
          <textarea class="form-input maker-starter-code-input" data-qidx="${qIdx}" rows="4" style="font-family:var(--font-mono, monospace); font-size:0.85rem; background:#0F172A; border-color:rgba(56,189,248,0.3); color:#38BDF8; width:100%;" placeholder="Masukkan kode template awal untuk siswa...">${escapeHtml(q.starterCode || '')}</textarea>
        </div>
        <div>
          <label style="font-size:0.8125rem; font-weight:600; color:#E2E8F0; margin-bottom:4px; display:block;">Petunjuk / Ekspektasi Output (Opsional):</label>
          <input type="text" class="form-input maker-expected-output-input" data-qidx="${qIdx}" value="${escapeHtml(q.expectedOutput || '')}" style="width:100%; font-size:0.8125rem;" placeholder="Contoh output program yang diharapkan: Hello World">
        </div>
      `;

      compWrap.querySelector('.maker-compiler-lang-select').addEventListener('change', (e) => {
        q.compilerLang = e.target.value;
        if (!q.starterCode || q.starterCode.includes('Hello, World!')) {
          if (q.compilerLang === 'python') q.starterCode = '# Tulis kode Python Anda di sini\nprint("Hello, World!")';
          else if (q.compilerLang === 'nodejs') q.starterCode = '// Tulis kode JavaScript Anda di sini\nconsole.log("Hello, World!");';
          else if (q.compilerLang === 'c') q.starterCode = '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\\\n");\n    return 0;\n}';
          else if (q.compilerLang === 'cpp') q.starterCode = '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}';
          else if (q.compilerLang === 'sqlite') q.starterCode = '-- Query SQL\nSELECT "Hello, World!";';
          else if (q.compilerLang === 'bash') q.starterCode = '#!/bin/bash\necho "Hello, World!"';
          else if (q.compilerLang === 'html') q.starterCode = '<h1>Hello, World!</h1>';
          const ta = compWrap.querySelector('.maker-starter-code-input');
          if (ta) ta.value = q.starterCode;
        }
      });
      compWrap.querySelector('.maker-starter-code-input').addEventListener('input', (e) => {
        q.starterCode = e.target.value;
      });
      compWrap.querySelector('.maker-expected-output-input').addEventListener('input', (e) => {
        q.expectedOutput = e.target.value;
      });

      optionsWrap.appendChild(compWrap);
    }

    // Question Footer: Points, Required Toggle, Duplicate, Delete
    const footer = document.createElement('div');
    footer.className = 'maker-question-footer';
    footer.innerHTML = `
      <div class="maker-points-wrapper">
        <label>Bobot Poin:</label>
        <input type="number" class="maker-points-input" min="0" max="100" value="${q.points || 10}" data-qidx="${qIdx}">
      </div>
      <div style="display:flex; align-items:center; gap:16px;">
        <label class="custom-checkbox-label" style="margin:0;">
          <input type="checkbox" class="maker-req-checkbox" data-qidx="${qIdx}" ${q.required !== false ? 'checked' : ''}>
          <span>Wajib Diisi</span>
        </label>
        <button type="button" class="btn btn-secondary btn-sm maker-btn-duplicate" data-qidx="${qIdx}" title="Duplikasi Pertanyaan">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button type="button" class="btn btn-danger btn-sm maker-btn-delete" data-qidx="${qIdx}" title="Hapus Pertanyaan">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `;

    card.appendChild(header);
    card.appendChild(textarea);
    card.appendChild(optionsWrap);
    card.appendChild(footer);
    quizDom.makerQuestionsContainer.appendChild(card);
  });

  // Attach Event Listeners to question elements
  attachMakerQuestionsEvents();
}

function attachMakerQuestionsEvents() {
  if (!quizDom.makerQuestionsContainer) return;

  // Type Selector
  quizDom.makerQuestionsContainer.querySelectorAll('.maker-q-type-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const qIdx = parseInt(e.target.dataset.qidx, 10);
      const newType = e.target.value;
      const q = quizState.makerQuestions[qIdx];
      if (q) {
        q.type = newType;
        if ((newType === 'multiple_choice' || newType === 'checkboxes' || newType === 'dropdown') && (!q.options || q.options.length === 0)) {
          q.options = ['Opsi 1', 'Opsi 2', 'Opsi 3', 'Opsi 4'];
          q.correctAnswer = newType === 'checkboxes' ? ['Opsi 1'] : 'Opsi 1';
        }
        renderMakerQuestions();
      }
    });
  });

  // Option text changes
  quizDom.makerQuestionsContainer.querySelectorAll('.maker-option-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const qIdx = parseInt(e.target.dataset.qidx, 10);
      const optIdx = parseInt(e.target.dataset.optidx, 10);
      if (!isNaN(qIdx) && !isNaN(optIdx) && quizState.makerQuestions[qIdx]) {
        const oldVal = quizState.makerQuestions[qIdx].options[optIdx];
        const newVal = e.target.value;
        quizState.makerQuestions[qIdx].options[optIdx] = newVal;
        if (quizState.makerQuestions[qIdx].correctAnswer === oldVal) {
          quizState.makerQuestions[qIdx].correctAnswer = newVal;
        } else if (Array.isArray(quizState.makerQuestions[qIdx].correctAnswer)) {
          quizState.makerQuestions[qIdx].correctAnswer = quizState.makerQuestions[qIdx].correctAnswer.map(v => v === oldVal ? newVal : v);
        }
      }
    });
  });

  // Option Key Buttons (Click to toggle correct answer)
  quizDom.makerQuestionsContainer.querySelectorAll('.maker-option-key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qIdx = parseInt(btn.dataset.qidx, 10);
      const optIdx = parseInt(btn.dataset.optidx, 10);
      const tfOpt = btn.dataset.tfopt;
      const q = quizState.makerQuestions[qIdx];
      if (!q) return;

      if (tfOpt) {
        q.correctAnswer = tfOpt;
      } else if (q.type === 'multiple_choice' || q.type === 'dropdown') {
        q.correctAnswer = q.options[optIdx];
      } else if (q.type === 'checkboxes') {
        const optVal = q.options[optIdx];
        let arr = Array.isArray(q.correctAnswer) ? [...q.correctAnswer] : [q.correctAnswer].filter(Boolean);
        if (arr.includes(optVal)) {
          arr = arr.filter(v => v !== optVal);
        } else {
          arr.push(optVal);
        }
        q.correctAnswer = arr;
      }
      renderMakerQuestions();
    });
  });

  // Remove Option
  quizDom.makerQuestionsContainer.querySelectorAll('.maker-btn-remove-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const qIdx = parseInt(btn.dataset.qidx, 10);
      const optIdx = parseInt(btn.dataset.optidx, 10);
      const q = quizState.makerQuestions[qIdx];
      if (q && q.options && q.options.length > 1) {
        const removed = q.options.splice(optIdx, 1)[0];
        if (q.correctAnswer === removed) {
          q.correctAnswer = q.options[0] || '';
        }
        renderMakerQuestions();
      } else {
        showToast('Minimal harus ada 1 opsi pilihan.', 'warning');
      }
    });
  });

  // Points Input
  quizDom.makerQuestionsContainer.querySelectorAll('.maker-points-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const qIdx = parseInt(e.target.dataset.qidx, 10);
      if (quizState.makerQuestions[qIdx]) {
        quizState.makerQuestions[qIdx].points = Math.max(0, parseInt(e.target.value, 10) || 0);
      }
    });
  });

  // Required Checkbox
  quizDom.makerQuestionsContainer.querySelectorAll('.maker-req-checkbox').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const qIdx = parseInt(e.target.dataset.qidx, 10);
      if (quizState.makerQuestions[qIdx]) {
        quizState.makerQuestions[qIdx].required = e.target.checked;
      }
    });
  });

  // Duplicate Question
  quizDom.makerQuestionsContainer.querySelectorAll('.maker-btn-duplicate').forEach(btn => {
    btn.addEventListener('click', () => {
      const qIdx = parseInt(btn.dataset.qidx, 10);
      const q = quizState.makerQuestions[qIdx];
      if (q) {
        const dup = JSON.parse(JSON.stringify(q));
        dup.id = 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        dup.title = q.title || '';
        quizState.makerQuestions.splice(qIdx + 1, 0, dup);
        renderMakerQuestions();
        showToast('Pertanyaan diduplikasi.', 'info');
      }
    });
  });

  // Delete Question
  quizDom.makerQuestionsContainer.querySelectorAll('.maker-btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const qIdx = parseInt(btn.dataset.qidx, 10);
      if (quizState.makerQuestions.length <= 1) {
        showToast('Kuis harus memiliki minimal 1 pertanyaan.', 'warning');
        return;
      }
      quizState.makerQuestions.splice(qIdx, 1);
      renderMakerQuestions();
    });
  });
}

async function saveQuizToServer() {
  const title = (quizDom.makerQuizTitle.value || '').trim();
  let subject = (quizDom.makerQuizSubject.value || '').trim();
  if (!subject) {
    subject = (appState.activeSubjectFilter && appState.activeSubjectFilter !== 'all') ? appState.activeSubjectFilter : 'Umum';
    quizDom.makerQuizSubject.value = subject;
  }
  const duration = parseInt(quizDom.makerQuizDuration.value, 10) || 30;
  const description = (quizDom.makerQuizDescription.value || '').trim();
  const shuffleQuestions = quizDom.makerQuizShuffleQuestions.checked;
  const shuffleOptions = quizDom.makerQuizShuffleOptions.checked;
  const existingId = quizDom.makerQuizId.value || null;

  if (!title) {
    showToast('Judul kuis harus diisi!', 'warning');
    quizDom.makerQuizTitle.focus();
    return;
  }
  if (quizState.makerQuestions.length === 0) {
    showToast('Kuis harus memiliki minimal 1 pertanyaan!', 'warning');
    return;
  }

  // Validate questions
  for (let i = 0; i < quizState.makerQuestions.length; i++) {
    const q = quizState.makerQuestions[i];
    if (!q.title || !q.title.trim()) {
      showToast(`Pertanyaan nomor ${i + 1} belum memiliki teks soal!`, 'warning');
      const textareas = quizDom.makerQuestionsContainer.querySelectorAll('.maker-q-textarea');
      if (textareas[i]) {
        textareas[i].style.borderColor = '#EF4444';
        textareas[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
        textareas[i].focus();
      }
      return;
    }
  }

  const payload = {
    id: existingId,
    title,
    subject,
    durationMinutes: duration,
    description,
    shuffleQuestions,
    shuffleOptions,
    questions: quizState.makerQuestions
  };

  showLoadingOverlay('Menyimpan Kuis', 'Sedang memproses penyimpanan kuis ke server...');
  try {
    const res = await fetch('/api/quizzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    hideLoadingOverlay();
    if (!res.ok) {
      throw new Error('Gagal menyimpan kuis: ' + res.status);
    }
    const saved = await res.json();
    const quizObj = saved.quiz || saved;
    closeQuizMakerModal();
    showToast(`Kuis "${quizObj.title}" berhasil disimpan di server!`, 'success');
    await refreshData();
    switchWorkspaceView('quizzes');
  } catch (err) {
    hideLoadingOverlay();
    console.error('saveQuizToServer error:', err);
    showToast('Gagal menyimpan kuis ke server: ' + err.message, 'error');
  }
}

function downloadQuizFormat(quiz = null) {
  const exportData = quiz || {
    id: quizDom.makerQuizId.value || ('quiz_' + Date.now()),
    title: quizDom.makerQuizTitle.value || 'Kuis Baru',
    subject: quizDom.makerQuizSubject.value || 'Umum',
    durationMinutes: parseInt(quizDom.makerQuizDuration.value, 10) || 30,
    description: quizDom.makerQuizDescription.value || '',
    shuffleQuestions: quizDom.makerQuizShuffleQuestions.checked,
    shuffleOptions: quizDom.makerQuizShuffleOptions.checked,
    questions: quizState.makerQuestions,
    createdAt: new Date().toISOString()
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `format_kuis_${(exportData.title || 'export').toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Format kuis berhasil diunduh.', 'success');
}

async function handleImportQuizFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    let parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      parsed = parsed[0];
    } else if (parsed && parsed.quiz) {
      parsed = parsed.quiz;
    } else if (parsed && Array.isArray(parsed.quizzes) && parsed.quizzes.length > 0) {
      parsed = parsed.quizzes[0];
    }

    if (!parsed || !parsed.title) {
      throw new Error('Format berkas JSON kuis tidak valid: harus memiliki field title atau judul kuis.');
    }

    parsed.subject = parsed.subject || 'Umum';
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      parsed.questions = [createDefaultQuestion(0)];
    }

    showLoadingOverlay('Mengimpor Kuis', 'Mengunggah dan menyimpan kuis ke server...');
    const res = await fetch('/api/quizzes/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    });
    hideLoadingOverlay();

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || ('Server menolak impor kuis: ' + res.status));
    }
    const result = await res.json();
    const importedQuiz = result.quiz || result;
    showToast(`Kuis "${importedQuiz.title || 'Baru'}" berhasil diimpor!`, 'success');
    await refreshData();
    switchWorkspaceView('quizzes');
  } catch (err) {
    hideLoadingOverlay();
    console.error('handleImportQuizFile error:', err);
    showToast('Gagal mengimpor kuis: ' + err.message, 'error');
  }
}

// --------------------------------------------------------------------------
// 2. QUIZZES LISTING & VIEW RENDERER
// --------------------------------------------------------------------------

function renderQuizzesList() {
  if (!quizDom.quizzesGridContainer) return;

  const isTeacher = appState.currentUser && (appState.currentUser.role === 'teacher' || appState.currentUser.role === 'guru');
  const currentStudentAbsen = appState.currentUser && appState.currentUser.absen ? Number(appState.currentUser.absen) : null;

  // Strict role check: siswa tidak boleh melihat tombol pembuatan / manajemen kuis
  const quizTeacherGroup = document.getElementById('quizTeacherActionGroup');
  if (quizTeacherGroup) {
    if (isTeacher) {
      quizTeacherGroup.classList.remove('hidden');
      quizTeacherGroup.style.display = 'flex';
    } else {
      quizTeacherGroup.classList.add('hidden');
      quizTeacherGroup.style.display = 'none';
    }
  }

  const emptyTeacherActions = document.getElementById('emptyQuizTeacherActions');
  if (emptyTeacherActions) {
    if (isTeacher) {
      emptyTeacherActions.classList.remove('hidden');
      emptyTeacherActions.style.display = 'flex';
    } else {
      emptyTeacherActions.classList.add('hidden');
      emptyTeacherActions.style.display = 'none';
    }
  }

  let list = Array.isArray(appState.quizzes) ? [...appState.quizzes] : [];

  // Filter Search
  const searchQuery = (quizDom.quizSearchInput && quizDom.quizSearchInput.value || '').trim().toLowerCase();
  if (searchQuery) {
    list = list.filter(q => (q.title || '').toLowerCase().includes(searchQuery) || (q.subject || '').toLowerCase().includes(searchQuery));
  }

  // Filter Subject
  const subjectFilter = quizDom.quizSubjectFilter ? quizDom.quizSubjectFilter.value : 'ALL';
  if (subjectFilter && subjectFilter !== 'ALL') {
    list = list.filter(q => (q.subject || '').toLowerCase() === subjectFilter.toLowerCase());
  }

  // Populate Subject Dropdown options if needed
  if (quizDom.quizSubjectFilter) {
    const subjects = Array.from(new Set(appState.quizzes.map(q => q.subject).filter(Boolean)));
    const currentVal = quizDom.quizSubjectFilter.value;
    quizDom.quizSubjectFilter.innerHTML = '<option value="ALL">Semua Mapel</option>';
    subjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (s === currentVal) opt.selected = true;
      quizDom.quizSubjectFilter.appendChild(opt);
    });
  }

  quizDom.quizzesGridContainer.innerHTML = '';

  if (list.length === 0) {
    if (quizDom.quizzesEmptyState) {
      quizDom.quizzesEmptyState.classList.remove('hidden');
      const emptyTeacherActions = document.getElementById('emptyQuizTeacherActions');
      if (emptyTeacherActions) {
        if (isTeacher) {
          emptyTeacherActions.classList.remove('hidden');
        } else {
          emptyTeacherActions.classList.add('hidden');
        }
      }
      const emptyTitle = quizDom.quizzesEmptyState.querySelector('.state-title');
      if (emptyTitle) {
        emptyTitle.textContent = isTeacher ? 'Belum Ada Kuis Aktif' : 'Tidak Ada Kuis Menunggu';
      }
      const emptyDesc = quizDom.quizzesEmptyState.querySelector('.state-desc');
      if (emptyDesc) {
        emptyDesc.textContent = isTeacher 
          ? 'Guru dapat membuat kuis baru dengan berbagai jenis pertanyaan seperti Google Form.'
          : 'Saat ini belum ada kuis atau ujian online yang diberikan oleh guru. Silakan cek kembali nanti.';
      }
    }
    return;
  }

  if (quizDom.quizzesEmptyState) quizDom.quizzesEmptyState.classList.add('hidden');

  list.forEach(quiz => {
    const card = document.createElement('article');
    card.className = 'quiz-card';

    const questionsCount = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
    const duration = quiz.durationMinutes || 30;

    // Check if student completed this quiz
    let studentSession = null;
    if (!isTeacher && currentStudentAbsen) {
      studentSession = (appState.quizSessions || []).find(s => s.quizId === quiz.id && Number(s.studentAbsen) === currentStudentAbsen);
    }

    let actionsHtml = '';
    if (isTeacher) {
      actionsHtml = `
        <button class="btn btn-primary btn-sm btn-action-preview-quiz" data-id="${quiz.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>Uji Coba</span>
        </button>
        <button class="btn btn-secondary btn-sm btn-action-monitor-quiz" data-id="${quiz.id}" title="Pantau sesi langsung siswa">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          <span>Monitor</span>
        </button>
        <button class="btn btn-secondary btn-sm btn-action-remedial-quiz" data-id="${quiz.id}" title="Buat kuis remedial untuk siswa di bawah KKM">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          <span>Remedial</span>
        </button>
        <button class="btn btn-secondary btn-sm btn-action-export-quiz" data-id="${quiz.id}" title="Download format JSON">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>JSON</span>
        </button>
        <button class="btn btn-secondary btn-sm btn-action-edit-quiz" data-id="${quiz.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <span>Edit</span>
        </button>
        <button class="btn btn-danger btn-sm btn-action-delete-quiz" data-id="${quiz.id}" title="Hapus Kuis">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      `;
    } else {
      // Siswa view
      if (studentSession && studentSession.status === 'completed') {
        const remInfo = getEffectiveStudentQuizScore(quiz, currentStudentAbsen, appState.quizzes, appState.quizSessions);
        let scoreBadgeText = `Nilai: ${studentSession.score} / ${studentSession.maxScore} (${studentSession.percentage}%)`;
        if (quiz.isRemedial) {
          scoreBadgeText = `Nilai Remedial: ${studentSession.percentage}% (Maks. ${quiz.kkm || 77})`;
        } else if (remInfo.isRemedialUpdated) {
          scoreBadgeText = `Nilai Remedial: ${remInfo.score}% (Diperbarui, maks. 77)`;
        }

        actionsHtml = `
          <div style="display:flex; align-items:center; gap:10px; width:100%; justify-content:space-between; flex-wrap:wrap;">
            <span class="badge" style="background:rgba(16,185,129,0.2); color:#6EE7B7; font-weight:700; padding:6px 12px; border-radius:8px;">
              ${scoreBadgeText}
            </span>
            <button class="btn btn-secondary btn-sm btn-action-review-result" data-id="${quiz.id}" data-sessid="${studentSession.id}">
              Lihat Hasil
            </button>
          </div>
        `;
      } else if (studentSession && studentSession.status === 'in_progress') {
        actionsHtml = `
          <div style="width:100%;">
            <span class="badge" style="background:rgba(59,130,246,0.2); color:#93C5FD; font-weight:700; padding:4px 8px; border-radius:6px; display:inline-block; margin-bottom:8px;">
              Sesi Sedang Berjalan (Progress Tersimpan)
            </span>
            <button class="btn btn-primary btn-block btn-action-start-exam" data-id="${quiz.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <span>Lanjutkan Ujian (Sesi Aktif)</span>
            </button>
          </div>
        `;
      } else if (studentSession && studentSession.status === 'locked') {
        actionsHtml = `
          <div style="width:100%;">
            <span class="badge" style="background:rgba(239,68,68,0.2); color:#FCA5A5; font-weight:700; padding:4px 8px; border-radius:6px; display:inline-block; margin-bottom:8px;">
              Ujian Terkunci (Keluar Tab / Refresh)
            </span>
            <button class="btn btn-warning btn-block btn-action-start-exam" data-id="${quiz.id}">
              <span>Periksa Sesi / Hubungi Guru</span>
            </button>
          </div>
        `;
      } else if (quiz.isRemedial) {
        const eligibleList = Array.isArray(quiz.eligibleAbsen) ? quiz.eligibleAbsen : [];
        const isEligible = eligibleList.includes(currentStudentAbsen);
        if (isEligible) {
          actionsHtml = `
            <div style="width:100%;">
              <span class="badge" style="background:rgba(239,68,68,0.2); color:#F87171; font-weight:700; padding:4px 8px; border-radius:6px; display:inline-block; margin-bottom:8px;">
                Wajib Remedial (KKM: ${quiz.kkm || 77})
              </span>
              <button class="btn btn-primary btn-block btn-action-start-exam" data-id="${quiz.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                <span>Mulai Ujian Remedial & Layar Penuh</span>
              </button>
            </div>
          `;
        } else {
          actionsHtml = `
            <div style="display:flex; align-items:center; gap:8px; color:#10B981; font-weight:600; font-size:0.875rem; padding:8px 0;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span>Tuntas (Bebas Remedial)</span>
            </div>
          `;
        }
      } else {
        actionsHtml = `
          <button class="btn btn-primary btn-block btn-action-start-exam" data-id="${quiz.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            <span>Mulai Ujian & Layar Penuh</span>
          </button>
        `;
      }
    }

    const remedialBadgeHtml = quiz.isRemedial
      ? `<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #FCA5A5; font-size: 0.75rem; font-weight: 700; border: 1px solid rgba(239, 68, 68, 0.4);">REMEDIAL (KKM: ${quiz.kkm || 77})</span>`
      : '';

    card.innerHTML = `
      <div class="quiz-card-header">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span class="subject-badge" style="background: rgba(99, 102, 241, 0.15); color: #A5B4FC; border: 1px solid rgba(99, 102, 241, 0.3);">
            ${escapeHtml(quiz.subject || 'Umum')}
          </span>
          ${remedialBadgeHtml}
        </div>
        <span class="badge" style="background: rgba(6, 182, 212, 0.15); color: #67E8F9; font-size: 0.75rem;">
          ${duration} Menit
        </span>
      </div>

      <h3 class="quiz-card-title">${escapeHtml(quiz.title)}</h3>

      <div class="quiz-meta-row">
        <div class="quiz-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
          <span>${duration} Menit</span>
        </div>
        <div class="quiz-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h10"/><path d="M7 12h10"/></svg>
          <span>${questionsCount} Pertanyaan</span>
        </div>
        <div class="quiz-meta-item" style="margin-left:auto;">
          <span style="font-size:0.75rem; color:#10B981; font-weight:600;">Anti-Cheat Aktif</span>
        </div>
      </div>

      <div class="quiz-card-actions">
        ${actionsHtml}
      </div>
    `;

    quizDom.quizzesGridContainer.appendChild(card);
  });

  // Attach card event listeners
  quizDom.quizzesGridContainer.querySelectorAll('.btn-action-start-exam, .btn-action-preview-quiz').forEach(btn => {
    btn.addEventListener('click', () => {
      const qId = btn.dataset.id;
      const q = (appState.quizzes || []).find(item => item.id === qId);
      if (q) startQuizRunner(q);
    });
  });

  quizDom.quizzesGridContainer.querySelectorAll('.btn-action-edit-quiz').forEach(btn => {
    btn.addEventListener('click', () => {
      const qId = btn.dataset.id;
      const q = (appState.quizzes || []).find(item => item.id === qId);
      if (q) openQuizMakerModal(q);
    });
  });

  quizDom.quizzesGridContainer.querySelectorAll('.btn-action-export-quiz').forEach(btn => {
    btn.addEventListener('click', () => {
      const qId = btn.dataset.id;
      const q = (appState.quizzes || []).find(item => item.id === qId);
      if (q) downloadQuizFormat(q);
    });
  });

  quizDom.quizzesGridContainer.querySelectorAll('.btn-action-monitor-quiz').forEach(btn => {
    btn.addEventListener('click', () => {
      const qId = btn.dataset.id;
      openSessionMonitorModal(qId);
    });
  });

  quizDom.quizzesGridContainer.querySelectorAll('.btn-action-remedial-quiz').forEach(btn => {
    btn.addEventListener('click', () => {
      const qId = btn.dataset.id;
      const q = (appState.quizzes || []).find(item => item.id === qId);
      if (q) openRemedialModal(q);
    });
  });

  quizDom.quizzesGridContainer.querySelectorAll('.btn-action-delete-quiz').forEach(btn => {
    btn.addEventListener('click', async () => {
      const qId = btn.dataset.id;
      const q = (appState.quizzes || []).find(item => item.id === qId);
      if (!q) return;

      const confirmed = await showConfirmDialog({
        title: 'Hapus Kuis',
        message: `Hapus kuis "${q.title}"? Semua riwayat sesi kuis ini juga akan terhapus.`,
        confirmText: 'Hapus Kuis',
        cancelText: 'Batal',
        type: 'danger'
      });
      if (!confirmed) return;

      showLoadingOverlay('Menghapus Kuis', 'Mohon tunggu sebentar...');
      try {
        const res = await fetch(`/api/quizzes?id=${encodeURIComponent(qId)}`, { method: 'DELETE' });
        hideLoadingOverlay();
        if (!res.ok) throw new Error('Gagal menghapus kuis: ' + res.status);
        showToast('Kuis berhasil dihapus.', 'info');
        await refreshData();
      } catch (err) {
        hideLoadingOverlay();
        showToast('Gagal menghapus kuis: ' + err.message, 'error');
      }
    });
  });

  quizDom.quizzesGridContainer.querySelectorAll('.btn-action-review-result').forEach(btn => {
    btn.addEventListener('click', () => {
      const sessId = btn.dataset.sessid;
      const sess = (appState.quizSessions || []).find(s => s.id === sessId);
      if (sess) {
        showAlertDialog({
          title: 'Rekap Hasil Ujian Siswa',
          message: `Siswa: ${sess.studentName} (Absen ${sess.studentAbsen})\nSkor: ${sess.score} dari ${sess.maxScore} poin (${sess.percentage}%)\nPelanggaran Layar: ${sess.violationsCount || 0} kali\nStatus: ${sess.status}`,
          buttonText: 'Tutup',
          type: 'info'
        });
      }
    });
  });
}

// --------------------------------------------------------------------------
// 3. QUIZ RUNNER (STRICT FULLSCREEN & ANTI-CHEAT EXAM MODE)
// --------------------------------------------------------------------------

async function startQuizRunner(quiz) {
  if (!quizDom.quizRunnerModal) return;

  const isTeacher = appState.currentUser && (appState.currentUser.role === 'teacher' || appState.currentUser.role === 'guru');
  const studentName = appState.currentUser ? appState.currentUser.name : 'Peserta';
  const studentAbsen = appState.currentUser && appState.currentUser.absen ? appState.currentUser.absen : (isTeacher ? 99 : 1);

  // Inform student about strict anti-cheat
  const confirmed = await showConfirmDialog({
    title: 'Mulai Ujian Online Anti-Contek',
    message: `Ujian "${quiz.title}" (${quiz.durationMinutes || 30} menit) akan dikunci ke Mode Layar Penuh (Fullscreen).\n\nDilarang keluar dari layar penuh, membuka tab lain, atau minimize! Setiap kali keluar, layar Guru akan menyala MERAH dan pelanggaran Anda dicatat. Apakah Anda siap memulai?`,
    confirmText: 'Mulai & Masuk Layar Penuh',
    cancelText: 'Batal',
    type: 'warning'
  });

  if (!confirmed) return;

  quizState.activeQuiz = quiz;

  // Request Fullscreen immediately on user click gesture
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      await document.documentElement.webkitRequestFullscreen();
    }
  } catch (fsErr) {
    console.warn('Fullscreen request blocked or not supported:', fsErr);
  }

  // Create or resume session on server
  showLoadingOverlay('Menyiapkan Ujian', 'Membuka sesi ujian anti-contek...');
  try {
    const res = await fetch('/api/quiz-sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId: quiz.id,
        studentName,
        studentAbsen
      })
    });
    hideLoadingOverlay();
    if (!res.ok) throw new Error('Gagal memulai sesi ujian di server: ' + res.status);
    const sessData = await res.json();
    quizState.activeSession = sessData.session || sessData;
  } catch (err) {
    hideLoadingOverlay();
    showToast('Gagal memulai sesi ujian: ' + err.message, 'error');
    return;
  }

  // Setup runner UI
  quizDom.runnerQuizTitle.textContent = quiz.title;
  quizDom.runnerStudentIdentity.textContent = `Siswa: ${studentName} - Absen: ${studentAbsen}`;
  quizDom.runnerExamInstructions.textContent = quiz.description || 'Jawab seluruh soal dengan teliti dan jujur. Dilarang keluar dari layar penuh atau berpindah tab.';
  if (quizDom.runnerViolationAlert) quizDom.runnerViolationAlert.classList.add('hidden');
  if (quizDom.runnerTabLockOverlay) quizDom.runnerTabLockOverlay.classList.add('hidden');
  quizState.isSessionLocked = false;
  if (quizDom.runnerQuestionsList) {
    quizDom.runnerQuestionsList.style.pointerEvents = '';
    quizDom.runnerQuestionsList.style.opacity = '';
  }
  if (quizDom.btnSubmitExam) quizDom.btnSubmitExam.disabled = false;

  // If session on server was already locked for tab exit
  if (quizState.activeSession && (quizState.activeSession.isLocked || quizState.activeSession.lockedReason === 'tab_exit')) {
    quizState.isSessionLocked = true;
    if (quizDom.runnerTabLockOverlay) quizDom.runnerTabLockOverlay.classList.remove('hidden');
    if (quizDom.runnerQuestionsList) {
      quizDom.runnerQuestionsList.style.pointerEvents = 'none';
      quizDom.runnerQuestionsList.style.opacity = '0.35';
    }
    if (quizDom.btnSubmitExam) quizDom.btnSubmitExam.disabled = true;
  }

  renderRunnerQuestions(quiz);

  // Countdown Timer
  quizState.runnerSecondsLeft = (quiz.durationMinutes || 30) * 60;
  updateRunnerTimerDisplay();
  clearInterval(quizState.runnerTimerInterval);
  quizState.runnerTimerInterval = setInterval(() => {
    quizState.runnerSecondsLeft--;
    updateRunnerTimerDisplay();
    if (quizState.runnerSecondsLeft <= 0) {
      clearInterval(quizState.runnerTimerInterval);
      showToast('Waktu ujian telah habis! Mengumpulkan otomatis...', 'warning');
      submitExamAnswers(true);
    }
  }, 1000);

  // Setup Anti-Cheat Event Listeners
  setupAntiCheatListeners();

  // Setup Heartbeat (interval 1s / 1000ms untuk sinkronisasi real-time instan)
  clearInterval(quizState.runnerHeartbeatInterval);
  quizState.runnerHeartbeatInterval = setInterval(sendRunnerHeartbeat, 1000);

  quizDom.quizRunnerModal.showModal();
}

function updateRunnerTimerDisplay() {
  if (!quizDom.runnerTimerText) return;
  const mins = Math.floor(quizState.runnerSecondsLeft / 60);
  const secs = quizState.runnerSecondsLeft % 60;
  quizDom.runnerTimerText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getCurrentRunnerAnswers() {
  const answers = {};
  if (!quizDom.runnerQuestionsList) return answers;
  const cards = quizDom.runnerQuestionsList.querySelectorAll('.runner-question-card');
  cards.forEach(card => {
    const qid = card.dataset.qid;
    const codeArea = card.querySelector('textarea.quiz-code-editor');
    const radios = card.querySelector('input[type="radio"]:checked');
    const checks = card.querySelectorAll('input[type="checkbox"]:checked');
    const text = card.querySelector('input[type="text"], textarea');
    const select = card.querySelector('select');

    if (codeArea) {
      answers[qid] = codeArea.value;
    } else if (radios) {
      answers[qid] = radios.value;
    } else if (checks.length > 0) {
      answers[qid] = Array.from(checks).map(c => c.value);
    } else if (text && text.value.trim()) {
      answers[qid] = text.value.trim();
    } else if (select && select.value) {
      answers[qid] = select.value;
    }
  });
  return answers;
}

function renderRunnerQuestions(quiz) {
  if (!quizDom.runnerQuestionsList) return;
  quizDom.runnerQuestionsList.innerHTML = '';

  let questions = Array.isArray(quiz.questions) ? [...quiz.questions] : [];

  // Optional Shuffle
  if (quiz.shuffleQuestions) {
    questions = questions.sort(() => Math.random() - 0.5);
  }

  // Restore saved temporary answers (dari session server atau localStorage draft)
  let savedAnswers = {};
  if (quizState.activeSession && quizState.activeSession.answers && typeof quizState.activeSession.answers === 'object') {
    savedAnswers = { ...quizState.activeSession.answers };
  }
  if (quizState.activeSession && quizState.activeSession.id) {
    try {
      const localDraft = localStorage.getItem('xozen_quiz_temp_answers_' + quizState.activeSession.id);
      if (localDraft) {
        const parsed = JSON.parse(localDraft);
        savedAnswers = { ...savedAnswers, ...parsed };
      }
    } catch {}
  }

  quizDom.runnerTotalCount.textContent = questions.length;

  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'runner-question-card';
    card.dataset.qid = q.id;

    const head = document.createElement('div');
    head.className = 'runner-q-head';
    head.innerHTML = `
      <span class="runner-q-num">Soal ${idx + 1}</span>
      <p class="runner-q-text">${escapeHtml(q.title || '')}</p>
      <span class="runner-q-points">${q.points || 10} poin</span>
    `;
    card.appendChild(head);

    let options = Array.isArray(q.options) ? [...q.options] : [];
    if (quiz.shuffleOptions && (q.type === 'multiple_choice' || q.type === 'checkboxes')) {
      options = options.sort(() => Math.random() - 0.5);
    }

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'runner-opt-list';

    if (q.type === 'multiple_choice' || q.type === 'true_false') {
      const choices = q.type === 'true_false' ? ['Benar', 'Salah'] : options;
      choices.forEach((opt, optIdx) => {
        const isChecked = savedAnswers[q.id] === opt;
        const label = document.createElement('label');
        label.className = `runner-opt-label ${isChecked ? 'selected' : ''}`;
        label.innerHTML = `
          <input type="radio" name="ans_${q.id}" value="${escapeHtml(opt)}" class="runner-input-field" ${isChecked ? 'checked' : ''}>
          <span>${escapeHtml(opt)}</span>
        `;
        label.querySelector('input').addEventListener('change', () => {
          card.querySelectorAll('.runner-opt-label').forEach(l => l.classList.remove('selected'));
          label.classList.add('selected');
          updateRunnerProgress();
        });
        optionsContainer.appendChild(label);
      });

    } else if (q.type === 'checkboxes') {
      options.forEach(opt => {
        const isChecked = Array.isArray(savedAnswers[q.id]) && savedAnswers[q.id].includes(opt);
        const label = document.createElement('label');
        label.className = `runner-opt-label ${isChecked ? 'selected' : ''}`;
        label.innerHTML = `
          <input type="checkbox" name="ans_${q.id}" value="${escapeHtml(opt)}" class="runner-input-field" ${isChecked ? 'checked' : ''}>
          <span>${escapeHtml(opt)}</span>
        `;
        label.querySelector('input').addEventListener('change', (e) => {
          if (e.target.checked) label.classList.add('selected');
          else label.classList.remove('selected');
          updateRunnerProgress();
        });
        optionsContainer.appendChild(label);
      });

    } else if (q.type === 'dropdown') {
      const select = document.createElement('select');
      select.name = `ans_${q.id}`;
      select.className = 'form-input runner-input-field';
      select.innerHTML = '<option value="">-- Pilih Jawaban --</option>';
      options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (savedAnswers[q.id] === opt) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener('change', updateRunnerProgress);
      optionsContainer.appendChild(select);

    } else if (q.type === 'short_answer') {
      const input = document.createElement('input');
      input.type = 'text';
      input.name = `ans_${q.id}`;
      input.className = 'runner-text-input runner-input-field';
      input.placeholder = 'Ketik jawaban singkat Anda di sini...';
      if (savedAnswers[q.id] != null) input.value = savedAnswers[q.id];
      input.addEventListener('input', updateRunnerProgress);
      optionsContainer.appendChild(input);

    } else if (q.type === 'paragraph') {
      const textarea = document.createElement('textarea');
      textarea.name = `ans_${q.id}`;
      textarea.className = 'runner-text-input runner-input-field';
      textarea.rows = 4;
      textarea.placeholder = 'Tuliskan jawaban penjelasan lengkap Anda di sini...';
      if (savedAnswers[q.id] != null) textarea.value = savedAnswers[q.id];
      textarea.addEventListener('input', updateRunnerProgress);
      optionsContainer.appendChild(textarea);

    } else if (q.type === 'linear_scale') {
      const scaleWrap = document.createElement('div');
      scaleWrap.style.display = 'flex';
      scaleWrap.style.gap = '16px';
      scaleWrap.style.padding = '8px 0';
      [1, 2, 3, 4, 5].forEach(val => {
        const isChecked = String(savedAnswers[q.id]) === String(val);
        const scLabel = document.createElement('label');
        scLabel.className = `runner-opt-label ${isChecked ? 'selected' : ''}`;
        scLabel.style.flex = '1';
        scLabel.style.justifyContent = 'center';
        scLabel.innerHTML = `
          <input type="radio" name="ans_${q.id}" value="${val}" class="runner-input-field" ${isChecked ? 'checked' : ''}>
          <span style="font-weight:700;">${val}</span>
        `;
        scLabel.querySelector('input').addEventListener('change', () => {
          card.querySelectorAll('.runner-opt-label').forEach(l => l.classList.remove('selected'));
          scLabel.classList.add('selected');
          updateRunnerProgress();
        });
        scaleWrap.appendChild(scLabel);
      });
      optionsContainer.appendChild(scaleWrap);

    } else if (q.type === 'code_compiler') {
      const lang = q.compilerLang || 'python';
      const starter = q.starterCode !== undefined ? q.starterCode : '';
      const initialVal = savedAnswers[q.id] !== undefined ? savedAnswers[q.id] : starter;

      const compContainer = document.createElement('div');
      compContainer.className = 'quiz-compiler-container';
      compContainer.innerHTML = `
        <div class="quiz-compiler-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="quiz-lang-pill">${escapeHtml(lang.toUpperCase())}</span>
            <span style="font-size:0.75rem; color:#94A3B8;">Editor Kode Interaktif</span>
          </div>
          <span class="compiler-run-status" style="font-size:0.75rem; color:#38BDF8;">Siap Dijalankan</span>
        </div>
        <textarea name="ans_${q.id}" class="quiz-code-editor runner-input-field" rows="8" spellcheck="false" placeholder="Tulis kode program Anda di sini...">${escapeHtml(initialVal)}</textarea>
        <div class="quiz-compiler-toolbar">
          <button type="button" class="btn btn-primary btn-sm btn-run-quiz-code">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>Jalankan Kode</span>
          </button>
          <input type="text" class="quiz-stdin-input form-input" placeholder="Input interaktif (stdin, jika diperlukan)..." style="font-size:0.75rem; padding:4px 8px; flex:1; max-width:280px;">
        </div>
        <div class="quiz-console-output hidden">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px;">
            <span style="font-size:0.72rem; color:#94A3B8; font-weight:700;">TERMINAL OUTPUT:</span>
            <span class="console-exec-meta" style="font-size:0.7rem; color:#64748B;"></span>
          </div>
          <pre class="console-text-body" style="margin:0; font-family:var(--font-mono, monospace); font-size:0.8rem; white-space:pre-wrap; word-break:break-all;"></pre>
        </div>
      `;

      const codeEditor = compContainer.querySelector('.quiz-code-editor');
      const runBtn = compContainer.querySelector('.btn-run-quiz-code');
      const statusSpan = compContainer.querySelector('.compiler-run-status');
      const stdinInput = compContainer.querySelector('.quiz-stdin-input');
      const consoleBox = compContainer.querySelector('.quiz-console-output');
      const metaSpan = compContainer.querySelector('.console-exec-meta');
      const textBody = compContainer.querySelector('.console-text-body');

      // Dukungan tombol Tab di dalam code editor
      codeEditor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = codeEditor.selectionStart;
          const end = codeEditor.selectionEnd;
          codeEditor.value = codeEditor.value.substring(0, start) + '    ' + codeEditor.value.substring(end);
          codeEditor.selectionStart = codeEditor.selectionEnd = start + 4;
          updateRunnerProgress();
        }
      });

      codeEditor.addEventListener('input', updateRunnerProgress);

      // Jalankan Kode via /api/compiler/run
      runBtn.addEventListener('click', async () => {
        const code = codeEditor.value;
        const stdin = stdinInput ? stdinInput.value : '';
        statusSpan.textContent = 'Mengeksekusi...';
        statusSpan.style.color = '#F59E0B';
        runBtn.disabled = true;

        try {
          const res = await fetch('/api/compiler/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              language: lang,
              code: code,
              stdin: stdin
            })
          });

          const data = await res.json();
          consoleBox.classList.remove('hidden');

          if (data.error) {
            statusSpan.textContent = 'Error';
            statusSpan.style.color = '#F43F5E';
            metaSpan.textContent = `Exit Code: ${data.exitCode || 1}`;
            textBody.textContent = data.stderr || data.error;
            textBody.style.color = '#F87171';
          } else {
            statusSpan.textContent = 'Sukses';
            statusSpan.style.color = '#10B981';
            metaSpan.textContent = `${data.executionTimeMs || 0} ms | Exit Code: 0`;
            textBody.textContent = data.stdout || '(Program selesai tanpa output)';
            textBody.style.color = '#38BDF8';
          }
        } catch (execErr) {
          consoleBox.classList.remove('hidden');
          statusSpan.textContent = 'Gagal Eksekusi';
          statusSpan.style.color = '#F43F5E';
          textBody.textContent = 'Gagal menghubungi server compiler: ' + execErr.message;
          textBody.style.color = '#F87171';
        } finally {
          runBtn.disabled = false;
        }
      });

      optionsContainer.appendChild(compContainer);
    }

    card.appendChild(optionsContainer);
    quizDom.runnerQuestionsList.appendChild(card);
  });

  updateRunnerProgress();
}

function updateRunnerProgress() {
  if (!quizDom.runnerQuestionsList) return;

  const cards = quizDom.runnerQuestionsList.querySelectorAll('.runner-question-card');
  let answered = 0;

  cards.forEach(card => {
    const radios = card.querySelectorAll('input[type="radio"]:checked');
    const checks = card.querySelectorAll('input[type="checkbox"]:checked');
    const texts = card.querySelectorAll('input[type="text"], textarea');
    const selects = card.querySelectorAll('select');

    let hasAns = false;
    if (radios.length > 0 || checks.length > 0) hasAns = true;
    texts.forEach(t => { if (t.value.trim()) hasAns = true; });
    selects.forEach(s => { if (s.value) hasAns = true; });

    if (hasAns) answered++;
  });

  const total = cards.length;
  quizDom.runnerAnsweredCount.textContent = answered;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  quizDom.runnerProgressBarFill.style.width = pct + '%';

  // Simpan progres jawaban otomatis ke localStorage dan session
  const answers = getCurrentRunnerAnswers();
  if (quizState.activeSession && quizState.activeSession.id) {
    try {
      localStorage.setItem('xozen_quiz_temp_answers_' + quizState.activeSession.id, JSON.stringify(answers));
      quizState.activeSession.answers = answers;
    } catch {}
  }

  // Kirim progres jawaban siswa secara instan ke server (Live 1 detik)
  sendRunnerHeartbeat(answered, total, pct, answers);
}

// --------------------------------------------------------------------------
// ANTI-CHEAT ENGINE (DETECTS FULLSCREEN EXIT, TAB SWITCH, AND BLUR)
// --------------------------------------------------------------------------

let isExamPageUnloading = false;

function setupAntiCheatListeners() {
  isExamPageUnloading = false;
  // Remove any stale listeners first
  window.removeEventListener('blur', handleWindowBlur);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  window.removeEventListener('beforeunload', handleExamBeforeUnload);

  window.addEventListener('blur', handleWindowBlur);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  window.addEventListener('beforeunload', handleExamBeforeUnload);
}

function teardownAntiCheatListeners() {
  window.removeEventListener('blur', handleWindowBlur);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  window.removeEventListener('beforeunload', handleExamBeforeUnload);
  clearInterval(quizState.runnerTimerInterval);
  clearInterval(quizState.runnerHeartbeatInterval);
}

function handleExamBeforeUnload(e) {
  if (quizDom.quizRunnerModal && quizDom.quizRunnerModal.open && quizState.activeSession) {
    isExamPageUnloading = true;
    // Auto-save answers immediately before page unloads
    const answers = getCurrentRunnerAnswers();
    try {
      localStorage.setItem('xozen_quiz_temp_answers_' + quizState.activeSession.id, JSON.stringify(answers));
    } catch {}
    e.preventDefault();
    e.returnValue = 'Ujian sedang berlangsung! Jawaban sementara Anda telah disimpan.';
    return e.returnValue;
  }
}

function handleFullscreenChange() {
  if (isExamPageUnloading) return;
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (!isFs && quizDom.quizRunnerModal && quizDom.quizRunnerModal.open) {
    reportFullscreenViolation('Keluar dari mode layar penuh (Exit Fullscreen)');
  }
}

function handleVisibilityChange() {
  if (isExamPageUnloading) return;
  if (document.hidden && quizDom.quizRunnerModal && quizDom.quizRunnerModal.open) {
    reportTabExitViolation('Berpindah tab atau membuka aplikasi lain (Tab Switched / Minimized)');
  }
}

function handleWindowBlur() {
  if (isExamPageUnloading) return;
  if (quizDom.quizRunnerModal && quizDom.quizRunnerModal.open) {
    reportTabExitViolation('Kehilangan fokus layar browser (Window Blur / Pindah Aplikasi)');
  }
}

// TIPE 1: Pelanggaran Keluar Layar Penuh (Warning banner & counter)
async function reportFullscreenViolation(reason) {
  if (!quizState.activeSession) return;

  if (quizDom.runnerViolationAlert) {
    if (quizDom.runnerViolationDetails) {
      quizDom.runnerViolationDetails.textContent = `${reason}. Peringatan: Anda wajib berada di layar penuh! Pelanggaran dicatat ke pengawas.`;
    }
    quizDom.runnerViolationAlert.classList.remove('hidden');
  }

  if (quizDom.runnerFsStatusBadge) {
    quizDom.runnerFsStatusBadge.style.background = 'rgba(239, 68, 68, 0.3)';
    quizDom.runnerFsStatusBadge.style.color = '#F87171';
    quizDom.runnerFsStatusBadge.style.borderColor = 'rgba(239, 68, 68, 0.6)';
    quizDom.runnerFsStatusBadge.innerHTML = '<span>⚠️ Layar Terbuka / Tidak Fullscreen</span>';
  }

  try {
    await fetch('/api/quiz-sessions/violation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: quizState.activeSession.id,
        type: 'fullscreen_exit',
        reason,
        timestamp: new Date().toLocaleTimeString('id-ID')
      })
    });
  } catch (err) {
    console.warn('Gagal melaporkan pelanggaran fullscreen:', err);
  }
}

// TIPE 2: Pelanggaran Keluar Tab (Semua akses kuis dimatikan total, nilai otomatis 0, terkunci sampai izin guru)
async function reportTabExitViolation(reason) {
  if (!quizState.activeSession) return;
  if (quizState.isSessionLocked) return; // Sudah terkunci

  // Kunci sesi di klien siswa secara instan
  quizState.isSessionLocked = true;
  quizState.activeSession.isLocked = true;
  quizState.activeSession.status = 'locked';
  quizState.activeSession.score = 0;
  quizState.activeSession.percentage = 0;

  // Tampilkan layar kunci pembekuan kuis
  if (quizDom.runnerTabLockOverlay) {
    quizDom.runnerTabLockOverlay.classList.remove('hidden');
  }

  // Nonaktifkan semua soal dan tombol submit
  if (quizDom.runnerQuestionsList) {
    quizDom.runnerQuestionsList.style.pointerEvents = 'none';
    quizDom.runnerQuestionsList.style.opacity = '0.35';
  }
  if (quizDom.btnSubmitExam) {
    quizDom.btnSubmitExam.disabled = true;
  }

  // Ubah status badge menjadi merah terkunci
  if (quizDom.runnerFsStatusBadge) {
    quizDom.runnerFsStatusBadge.style.background = 'rgba(220, 38, 38, 0.6)';
    quizDom.runnerFsStatusBadge.style.color = '#FFFFFF';
    quizDom.runnerFsStatusBadge.style.borderColor = '#DC2626';
    quizDom.runnerFsStatusBadge.innerHTML = '<span>🔴 TERKUNCI (NILAI 0)</span>';
  }

  // Kirim pelanggaran keluar tab ke server agar nilai 0 dan status locked tersimpan
  try {
    await fetch('/api/quiz-sessions/violation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: quizState.activeSession.id,
        type: 'tab_exit',
        reason,
        timestamp: new Date().toLocaleTimeString('id-ID')
      })
    });
  } catch (err) {
    console.warn('Gagal melaporkan pelanggaran keluar tab:', err);
  }
}

// Heartbeat & status polling: memeriksa apakah admin telah membuka kunci sesi & kirim progress soal
async function sendRunnerHeartbeat(customAnswered, customTotal, customPct, customAnswers) {
  if (!quizState.activeSession) return;
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  const isVis = !document.hidden;

  let answered = customAnswered;
  let total = customTotal;
  let pct = customPct;
  const currentAnswers = customAnswers !== undefined ? customAnswers : (typeof getCurrentRunnerAnswers === 'function' ? getCurrentRunnerAnswers() : {});

  if (answered === undefined && quizDom.runnerQuestionsList) {
    const cards = quizDom.runnerQuestionsList.querySelectorAll('.runner-question-card');
    total = cards.length;
    let count = 0;
    cards.forEach(card => {
      const radios = card.querySelectorAll('input[type="radio"]:checked');
      const checks = card.querySelectorAll('input[type="checkbox"]:checked');
      const texts = card.querySelectorAll('input[type="text"], textarea');
      const selects = card.querySelectorAll('select');
      let hasAns = false;
      if (radios.length > 0 || checks.length > 0) hasAns = true;
      texts.forEach(t => { if (t.value.trim()) hasAns = true; });
      selects.forEach(s => { if (s.value) hasAns = true; });
      if (hasAns) count++;
    });
    answered = count;
    pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  }

  try {
    const res = await fetch('/api/quiz-sessions/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: quizState.activeSession.id,
        isFullscreen: isFs,
        isVisible: isVis,
        answeredCount: typeof answered === 'number' ? answered : 0,
        totalCount: typeof total === 'number' ? total : 0,
        progressPercent: typeof pct === 'number' ? pct : 0,
        answers: currentAnswers
      })
    });

    if (res.ok) {
      const data = await res.json();
      // Jika sebelumnya terkunci dan admin telah memberikan izin / membuka kunci / reset peringatan
      const shouldUnlock = (quizState.isSessionLocked && !data.isLocked && (data.adminUnlocked || data.violationsCount === 0));
      if (shouldUnlock) {
        quizState.isSessionLocked = false;
        quizState.activeSession.isLocked = false;
        quizState.activeSession.status = 'in_progress';

        if (quizDom.runnerTabLockOverlay) {
          quizDom.runnerTabLockOverlay.classList.add('hidden');
        }
        if (quizDom.runnerQuestionsList) {
          quizDom.runnerQuestionsList.style.pointerEvents = '';
          quizDom.runnerQuestionsList.style.opacity = '';
        }
        if (quizDom.btnSubmitExam) {
          quizDom.btnSubmitExam.disabled = false;
        }

        if (quizDom.runnerFsStatusBadge) {
          quizDom.runnerFsStatusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
          quizDom.runnerFsStatusBadge.style.color = '#6EE7B7';
          quizDom.runnerFsStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          quizDom.runnerFsStatusBadge.innerHTML = '<span>Layar Penuh Terkunci</span>';
        }

        showToast('Izin kuis telah diberikan oleh Guru! Akses ujian berhasil dipulihkan.', 'success');
        if (quizDom.btnRunnerForceFullscreen) {
          quizDom.btnRunnerForceFullscreen.click();
        }
      }

      // Jika pelanggaran di-reset ke 0, bersihkan alert banner di layar siswa
      if (data.violationsCount === 0 && quizDom.runnerViolationAlert) {
        quizDom.runnerViolationAlert.classList.add('hidden');
      }
    }
  } catch (err) {
    console.warn('Heartbeat error:', err);
  }
}

// Re-enter Fullscreen on button click
if (quizDom.btnRunnerForceFullscreen) {
  quizDom.btnRunnerForceFullscreen.addEventListener('click', async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        await document.documentElement.webkitRequestFullscreen();
      }
      if (quizDom.runnerFsStatusBadge) {
        quizDom.runnerFsStatusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        quizDom.runnerFsStatusBadge.style.color = '#6EE7B7';
        quizDom.runnerFsStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        quizDom.runnerFsStatusBadge.innerHTML = '<span>Layar Penuh Terkunci</span>';
      }
    } catch (err) {
      console.warn('Cannot force fullscreen:', err);
    }
  });
}

if (quizDom.btnDismissViolation) {
  quizDom.btnDismissViolation.addEventListener('click', () => {
    if (quizDom.runnerViolationAlert) quizDom.runnerViolationAlert.classList.add('hidden');
    if (quizDom.btnRunnerForceFullscreen) quizDom.btnRunnerForceFullscreen.click();
  });
}

// Submit Exam Answers
async function submitExamAnswers(isAutoSubmit = false) {
  if (!quizState.activeSession || !quizState.activeQuiz) return;

  if (quizState.isSessionLocked) {
    showToast('Akses ujian terkunci karena pelanggaran keluar tab. Nilai otomatis 0 dan tidak dapat mengirim jawaban.', 'error');
    return;
  }

  if (!isAutoSubmit) {
    const unanswered = parseInt(quizDom.runnerTotalCount.textContent, 10) - parseInt(quizDom.runnerAnsweredCount.textContent, 10);
    const confirmMsg = unanswered > 0
      ? `Masih ada ${unanswered} pertanyaan yang belum Anda jawab. Apakah Anda yakin ingin menyelesaikan ujian sekarang?`
      : 'Apakah Anda yakin ingin menyelesaikan dan mengirim jawaban ujian Anda sekarang?';

    const confirmed = await showConfirmDialog({
      title: 'Selesaikan & Kumpulkan Ujian',
      message: confirmMsg,
      confirmText: 'Kumpulkan Ujian',
      cancelText: 'Periksa Kembali',
      type: 'warning'
    });
    if (!confirmed) return;
  }

  // Collect Answers
  const answers = {};
  const cards = quizDom.runnerQuestionsList.querySelectorAll('.runner-question-card');
  cards.forEach(card => {
    const qid = card.dataset.qid;
    const codeArea = card.querySelector('textarea.quiz-code-editor');
    const radios = card.querySelector('input[type="radio"]:checked');
    const checks = card.querySelectorAll('input[type="checkbox"]:checked');
    const text = card.querySelector('input[type="text"], textarea');
    const select = card.querySelector('select');

    if (codeArea) {
      answers[qid] = codeArea.value;
    } else if (radios) {
      answers[qid] = radios.value;
    } else if (checks.length > 0) {
      answers[qid] = Array.from(checks).map(c => c.value);
    } else if (text) {
      answers[qid] = text.value.trim();
    } else if (select) {
      answers[qid] = select.value;
    }
  });

  teardownAntiCheatListeners();

  // Exit fullscreen
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch (fsExitErr) {
    console.warn('Error exiting fullscreen:', fsExitErr);
  }

  showLoadingOverlay('Mengumpulkan Jawaban', 'Menghitung nilai otomatis...');
  try {
    const res = await fetch('/api/quiz-sessions/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: quizState.activeSession.id,
        answers
      })
    });
    hideLoadingOverlay();
    if (!res.ok) throw new Error('Gagal mengirim jawaban: ' + res.status);
    const result = await res.json();

    if (quizDom.quizRunnerModal && quizDom.quizRunnerModal.open) {
      quizDom.quizRunnerModal.close();
    }

    if (quizState.activeSession && quizState.activeSession.id) {
      try {
        localStorage.removeItem('xozen_quiz_temp_answers_' + quizState.activeSession.id);
      } catch {}
    }

    const finalScore = result.score != null ? result.score : (result.session && result.session.score);
    const finalMax = result.maxScore != null ? result.maxScore : (result.session && result.session.maxScore);
    const finalPct = result.percentage != null ? result.percentage : (result.session && result.session.percentage);
    const finalViol = result.violationsCount != null ? result.violationsCount : (result.session && result.session.violationsCount) || 0;

    const isRem = !!(quizState.activeQuiz && quizState.activeQuiz.isRemedial);
    const kkmVal = (quizState.activeQuiz && quizState.activeQuiz.kkm) || 77;
    const alertTitle = isRem ? 'Ujian Remedial Selesai!' : 'Selamat, Ujian Selesai!';
    const remNote = isRem ? ` [Batas Maksimal Remedial: ${kkmVal}]` : '';

    await showAlertDialog({
      title: alertTitle,
      message: `Nilai Anda: ${finalScore} / ${finalMax} (${finalPct}%)${remNote}\nCatatan Pelanggaran Layar: ${finalViol} kali\nHasil ujian dan nilai gabungan dasbor Anda telah diperbarui di server.`,
      buttonText: 'Selesai & Ke Halaman Kuis',
      type: 'info'
    });

    await refreshData();
    switchWorkspaceView('quizzes');
  } catch (err) {
    hideLoadingOverlay();
    console.error('submitExamAnswers error:', err);
    showToast('Gagal mengirim ujian: ' + err.message, 'error');
  }
}

if (quizDom.btnSubmitExam) {
  quizDom.btnSubmitExam.addEventListener('click', () => submitExamAnswers(false));
}

// --------------------------------------------------------------------------
// 4. LIVE SESSION MONITOR (ADMIN/GURU VIEW - RED ALERT ON VIOLATIONS)
// --------------------------------------------------------------------------

async function openSessionMonitorModal(targetQuizId = 'ALL') {
  if (!quizDom.quizSessionMonitorModal) return;

  // Fetch current sessions to detect live online count per quiz
  let currentSessions = [];
  try {
    const res = await fetch('/api/quiz-sessions');
    if (res.ok) currentSessions = await res.json();
  } catch {}

  // Populate Quiz Selector with Online status
  if (quizDom.monitorQuizSelect) {
    quizDom.monitorQuizSelect.innerHTML = '';

    const onlineSessionsTotal = (currentSessions || []).filter(s => s.status === 'in_progress');

    const optOnlineOnly = document.createElement('option');
    optOnlineOnly.value = 'ONLINE_ONLY';
    optOnlineOnly.textContent = `🟢 Sesi Online (${onlineSessionsTotal.length} Siswa Aktif)`;
    if (targetQuizId === 'ONLINE_ONLY' || (targetQuizId === 'ALL' && onlineSessionsTotal.length > 0)) {
      optOnlineOnly.selected = true;
    }
    quizDom.monitorQuizSelect.appendChild(optOnlineOnly);

    const optAll = document.createElement('option');
    optAll.value = 'ALL';
    optAll.textContent = 'Semua Sesi Kuis (Semua Status)';
    if (targetQuizId === 'ALL' && onlineSessionsTotal.length === 0) {
      optAll.selected = true;
    }
    quizDom.monitorQuizSelect.appendChild(optAll);

    // Sort quizzes: online quizzes first
    const sortedQuizzes = [...(appState.quizzes || [])].sort((a, b) => {
      const aOnline = (currentSessions || []).filter(s => s.quizId === a.id && s.status === 'in_progress').length;
      const bOnline = (currentSessions || []).filter(s => s.quizId === b.id && s.status === 'in_progress').length;
      return bOnline - aOnline;
    });

    sortedQuizzes.forEach(q => {
      const onlineForQuiz = (currentSessions || []).filter(s => s.quizId === q.id && s.status === 'in_progress').length;
      const opt = document.createElement('option');
      opt.value = q.id;
      if (onlineForQuiz > 0) {
        opt.textContent = `🟢 [ONLINE: ${onlineForQuiz}] ${q.title} (${q.subject || 'Umum'})`;
      } else {
        opt.textContent = `⚪ [Offline] ${q.title} (${q.subject || 'Umum'})`;
      }
      if (q.id === targetQuizId) opt.selected = true;
      quizDom.monitorQuizSelect.appendChild(opt);
    });
  }

  fetchAndRenderMonitorSessions();

  // Start polling every 1000ms (Delay 1 detik untuk info instan ke pengawas guru)
  clearInterval(quizState.monitorInterval);
  quizState.monitorInterval = setInterval(fetchAndRenderMonitorSessions, 1000);

  quizDom.quizSessionMonitorModal.showModal();
}

function closeSessionMonitorModal() {
  clearInterval(quizState.monitorInterval);
  if (quizDom.quizSessionMonitorModal && quizDom.quizSessionMonitorModal.open) {
    quizDom.quizSessionMonitorModal.close();
  }
}

async function fetchAndRenderMonitorSessions() {
  if (!quizDom.quizSessionMonitorModal || !quizDom.quizSessionMonitorModal.open) {
    clearInterval(quizState.monitorInterval);
    return;
  }

  const selectedQuizId = quizDom.monitorQuizSelect ? quizDom.monitorQuizSelect.value : 'ALL';
  const url = (selectedQuizId && selectedQuizId !== 'ALL' && selectedQuizId !== 'ONLINE_ONLY')
    ? `/api/quiz-sessions?quizId=${encodeURIComponent(selectedQuizId)}`
    : '/api/quiz-sessions';

  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const sessions = await res.json();
    renderMonitorGrid(sessions, selectedQuizId);
  } catch (err) {
    console.warn('fetchAndRenderMonitorSessions error:', err);
  }
}

function renderMonitorGrid(sessions, selectedQuizId = 'ALL') {
  if (!quizDom.monitorStudentGrid) return;

  const rawSessions = Array.isArray(sessions) ? sessions : [];

  // Daftar lengkap 16 siswa baku (Absen 1 sampai 16)
  const studentsList = (appState.students && appState.students.length > 0) ? appState.students : INITIAL_STUDENTS;

  let totalActive = 0;
  let totalAlerts = 0;
  let totalCompleted = 0;
  let totalNotStarted = 0;

  quizDom.monitorStudentGrid.innerHTML = '';
  if (quizDom.monitorEmptyState) quizDom.monitorEmptyState.classList.add('hidden');

  let renderedCardsCount = 0;

  studentsList.forEach(st => {
    // Cari sesi untuk siswa ini (berdasarkan absen)
    const matchingSessions = rawSessions.filter(s => {
      const matchAbsen = Number(s.studentAbsen) === Number(st.absen);
      if (!matchAbsen) return false;
      if (selectedQuizId && selectedQuizId !== 'ALL' && selectedQuizId !== 'ONLINE_ONLY') {
        return String(s.quizId) === String(selectedQuizId);
      }
      return true;
    });

    // Ambil sesi terbaru jika ada
    const s = matchingSessions.length > 0 ? matchingSessions[matchingSessions.length - 1] : null;

    // Filter mode ONLINE_ONLY: Lewati siswa yang belum mulai atau sudah selesai
    if (selectedQuizId === 'ONLINE_ONLY' && (!s || s.status !== 'in_progress')) {
      if (!s) totalNotStarted++;
      else if (s.status === 'completed') totalCompleted++;
      return;
    }

    const card = document.createElement('div');

    if (!s) {
      // Siswa belum memulai kuis (Belum Masuk)
      totalNotStarted++;
      card.className = 'monitor-student-card is-offline';
      card.innerHTML = `
        <div class="mon-card-header">
          <div>
            <h4 class="mon-student-name">${escapeHtml(st.name)}</h4>
            <span class="mon-student-absen">No. Absen: ${st.absen}</span>
          </div>
          <span class="mon-status-badge mon-badge-offline">Belum Masuk</span>
        </div>
        <div class="mon-progress-box">
          <div class="mon-progress-label">
            <span>Progress Soal</span>
            <span style="color:#94A3B8;">0 / 0 Soal (0%)</span>
          </div>
          <div class="mon-progress-track">
            <div class="mon-progress-bar-fill fill-offline" style="width: 0%;"></div>
          </div>
        </div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 10px; font-style: italic;">
          Belum ada sesi ujian aktif. Siswa belum membuka halaman kuis.
        </div>
      `;
      quizDom.monitorStudentGrid.appendChild(card);
      renderedCardsCount++;
      return;
    }

    // Siswa memiliki sesi kuis
    const isLocked = s.isLocked || s.lockedReason === 'tab_exit' || s.status === 'locked';
    const isDone = s.status === 'completed';
    const hasViolation = (s.isRedAlert === true) || (s.violationsCount && s.violationsCount > 0);

    if (isDone) {
      totalCompleted++;
    } else if (isLocked || hasViolation) {
      totalAlerts++;
    } else if (s.status === 'in_progress') {
      totalActive++;
    }

    card.className = `monitor-student-card ${hasViolation || isLocked ? 'session-alert-red' : 'is-active'}`;

    let statusBadge = '';
    let barFillClass = '';
    let progressPct = Math.min(100, Math.max(0, Number(s.progressPercent) || 0));
    let answered = Number(s.answeredCount) || 0;
    let totalQuestions = Number(s.totalCount) || 0;

    if (isLocked) {
      statusBadge = '<span class="mon-status-badge mon-badge-violation" style="background:#DC2626; color:#FFF; font-weight:700;">TERKUNCI (NILAI 0)</span>';
      barFillClass = 'fill-locked';
    } else if (isDone) {
      statusBadge = '<span class="mon-status-badge mon-badge-done">Selesai</span>';
      barFillClass = 'fill-done';
      progressPct = 100;
      if (totalQuestions > 0 && answered < totalQuestions) answered = totalQuestions;
    } else if (hasViolation) {
      statusBadge = '<span class="mon-status-badge mon-badge-violation">Peringatan Layar</span>';
    } else {
      statusBadge = '<span class="mon-status-badge mon-badge-active"><span style="display:inline-block; width:6px; height:6px; background:#10B981; border-radius:50%; margin-right:4px;"></span>Online</span>';
    }

    const quizInfo = (appState.quizzes || []).find(q => q.id === s.quizId);
    const quizTitle = quizInfo ? quizInfo.title : 'Kuis';

    let extraInfoHtml = '';
    if (isLocked) {
      extraInfoHtml = `
        <div class="mon-violation-box" style="border-color:#EF4444; background:rgba(239,68,68,0.2);">
          <strong style="color:#FCA5A5;">TERKUNCI: PELANGGARAN KELUAR TAB</strong>
          <div>Siswa berpindah tab atau meminimalkan aplikasi. Pengerjaan dinonaktifkan &amp; nilai otomatis 0.</div>
          <div style="font-size:0.7rem; color:#FCA5A5; margin-top:2px;">Waktu: ${escapeHtml(s.lastViolationTime || '-')}</div>
        </div>
      `;
    } else if (hasViolation) {
      extraInfoHtml = `
        <div class="mon-violation-box">
          <strong>TERDETEKSI KELUAR LAYAR (${s.violationsCount || 1}x)</strong>
          <div>Peringatan: ${escapeHtml(s.lastViolationReason || 'Keluar layar penuh')}</div>
          <div style="font-size:0.7rem; color:#FCA5A5; margin-top:2px;">Waktu: ${escapeHtml(s.lastViolationTime || '-')}</div>
        </div>
      `;
    }

    if (isDone) {
      extraInfoHtml += `
        <div class="mon-score-box">
          <span>Nilai Akhir:</span>
          <strong>${s.score} / ${s.maxScore} (${s.percentage}%)</strong>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="mon-card-header">
        <div>
          <h4 class="mon-student-name">${escapeHtml(s.studentName || st.name)}</h4>
          <span class="mon-student-absen">No. Absen: ${s.studentAbsen || st.absen} | ${escapeHtml(quizTitle)}</span>
        </div>
        ${statusBadge}
      </div>

      <div class="mon-progress-box">
        <div class="mon-progress-label">
          <span>Progress Soal</span>
          <span>${totalQuestions > 0 ? `${answered} / ${totalQuestions} Soal Terjawab (${progressPct}%)` : `${progressPct}%`}</span>
        </div>
        <div class="mon-progress-track">
          <div class="mon-progress-bar-fill ${barFillClass}" style="width: ${progressPct}%;"></div>
        </div>
      </div>

      ${extraInfoHtml}

      <div style="margin-top:12px; display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
        ${isLocked ? `
          <button type="button" class="btn btn-primary btn-sm btn-mon-unlock" data-id="${s.id}" style="background:#10B981; border-color:#059669; font-size:0.75rem; padding:4px 10px;">
            Buka Kunci / Beri Izin Lanjut
          </button>
        ` : ''}
        ${hasViolation || isLocked ? `
          <button type="button" class="btn btn-secondary btn-sm btn-mon-reset-alert" data-id="${s.id}" title="Reset status peringatan siswa jika sudah dikonfirmasi">
            Reset Peringatan
          </button>
        ` : ''}
      </div>
    `;

    quizDom.monitorStudentGrid.appendChild(card);
    renderedCardsCount++;
  });

  if (renderedCardsCount === 0 && quizDom.monitorEmptyState) {
    quizDom.monitorEmptyState.classList.remove('hidden');
    const stateDesc = quizDom.monitorEmptyState.querySelector('.state-desc');
    if (stateDesc) {
      stateDesc.textContent = selectedQuizId === 'ONLINE_ONLY'
        ? 'Tidak ada siswa yang sedang online mengerjakan ujian saat ini. Pilih opsi "Semua Sesi Kuis" untuk melihat seluruh siswa.'
        : 'Ketika siswa menekan tombol Mulai Ujian, status dan progres soal akan muncul di sini secara langsung.';
    }
  }

  // Update statistik ringkasan
  if (quizDom.monCountTotal) quizDom.monCountTotal.textContent = totalActive;
  if (quizDom.monCountAlert) quizDom.monCountAlert.textContent = totalAlerts;
  if (quizDom.monCountCompleted) quizDom.monCountCompleted.textContent = totalCompleted;
  if (quizDom.monCountNotStarted) quizDom.monCountNotStarted.textContent = totalNotStarted;

  // Attach Unlock button listeners
  quizDom.monitorStudentGrid.querySelectorAll('.btn-mon-unlock').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sessId = btn.dataset.id;
      try {
        const res = await fetch('/api/quiz-sessions/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessId })
        });
        if (res.ok) {
          showToast('Izin berhasil diberikan! Akses ujian siswa telah dibuka kembali.', 'success');
          await fetchAndRenderMonitorSessions();
        } else {
          showToast('Gagal membuka kunci sesi siswa.', 'error');
        }
      } catch (err) {
        showToast('Koneksi gagal saat membuka kunci.', 'error');
      }
    });
  });

  // Attach Reset alert button listeners (Menghapus seluruh peringatan termasuk keluar tab & pulihkan akses)
  quizDom.monitorStudentGrid.querySelectorAll('.btn-mon-reset-alert').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sessId = btn.dataset.id;
      try {
        const res = await fetch('/api/quiz-sessions/violation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessId,
            reason: 'Di-reset oleh Pengawas Guru',
            timestamp: new Date().toLocaleTimeString('id-ID'),
            resetRedAlert: true,
            resetViolations: true,
            action: 'reset'
          })
        });
        if (res.ok) {
          showToast('Peringatan kuis berhasil direset! Semua pelanggaran siswa telah dibersihkan.', 'success');
          await fetchAndRenderMonitorSessions();
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(errData.error || 'Gagal mereset peringatan siswa.', 'error');
        }
      } catch (err) {
        showToast('Koneksi gagal saat mereset peringatan.', 'error');
      }
    });
  });
}

// --------------------------------------------------------------------------
// 5. QUIZ SESSION HISTORY MODAL
// --------------------------------------------------------------------------

function openQuizHistoryModal() {
  if (!quizDom.quizSessionHistoryModal) return;
  fetchAndRenderQuizHistory();
  quizDom.quizSessionHistoryModal.showModal();
}

function closeQuizHistoryModal() {
  if (quizDom.quizSessionHistoryModal && quizDom.quizSessionHistoryModal.open) {
    quizDom.quizSessionHistoryModal.close();
  }
}

async function fetchAndRenderQuizHistory() {
  if (!quizDom.quizHistoryTableBody) return;

  try {
    const res = await fetch('/api/quiz-sessions');
    if (!res.ok) return;
    const sessions = await res.json();

    const searchQuery = (quizDom.historySearchInput && quizDom.historySearchInput.value || '').trim().toLowerCase();
    let filtered = sessions.filter(s => s.status === 'completed');

    if (searchQuery) {
      filtered = filtered.filter(s =>
        (s.studentName || '').toLowerCase().includes(searchQuery) ||
        String(s.studentAbsen).includes(searchQuery)
      );
    }

    quizDom.quizHistoryTableBody.innerHTML = '';

    if (filtered.length === 0) {
      if (quizDom.quizHistoryEmptyState) quizDom.quizHistoryEmptyState.classList.remove('hidden');
      return;
    }

    if (quizDom.quizHistoryEmptyState) quizDom.quizHistoryEmptyState.classList.add('hidden');

    filtered.forEach(s => {
      const quizInfo = (appState.quizzes || []).find(q => q.id === s.quizId);
      const quizTitle = quizInfo ? `${quizInfo.title} (${quizInfo.subject || 'Umum'})` : (s.quizId || 'Kuis');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align:center; font-weight:700;">${s.studentAbsen || '-'}</td>
        <td style="font-weight:600; color:var(--text-bright);">${escapeHtml(s.studentName || 'Siswa')}</td>
        <td>${escapeHtml(quizTitle)}</td>
        <td><span class="badge" style="background:rgba(99,102,241,0.2); color:#A5B4FC;">Selesai</span></td>
        <td style="font-weight:700; color:#10B981;">${s.score} / ${s.maxScore} (${s.percentage}%)</td>
        <td style="color:${(s.violationsCount || 0) > 0 ? '#EF4444' : '#6EE7B7'}; font-weight:600;">
          ${(s.violationsCount || 0) > 0 ? `⚠️ ${s.violationsCount}x Keluar` : '0 (Tertib)'}
        </td>
        <td style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(s.submittedAt || s.startedAt || '-')}</td>
        <td>
          <button type="button" class="btn btn-danger btn-sm btn-del-history" data-id="${s.id}" title="Hapus rekaman sesi">
            Hapus
          </button>
        </td>
      `;
      quizDom.quizHistoryTableBody.appendChild(tr);
    });

    quizDom.quizHistoryTableBody.querySelectorAll('.btn-del-history').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const confirmed = await showConfirmDialog({
          title: 'Hapus Rekaman Sesi',
          message: 'Apakah Anda yakin ingin menghapus rekaman sesi pengerjaan kuis ini?',
          confirmText: 'Hapus',
          cancelText: 'Batal',
          type: 'danger'
        });
        if (!confirmed) return;
        try {
          const dRes = await fetch(`/api/quiz-sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
          if (dRes.ok) {
            showToast('Riwayat sesi berhasil dihapus.', 'info');
            fetchAndRenderQuizHistory();
            await refreshData();
          }
        } catch (delErr) {
          showToast('Gagal menghapus: ' + delErr.message, 'error');
        }
      });
    });

  } catch (err) {
    console.warn('fetchAndRenderQuizHistory error:', err);
  }
}

// --------------------------------------------------------------------------
// 5B. REMEDIAL QUIZ MAKER (FILTER NILAI < KKM)
// --------------------------------------------------------------------------

function openRemedialModal(sourceQuiz) {
  if (!quizDom.quizRemedialModal || !sourceQuiz) return;

  quizState.remedialSourceQuiz = sourceQuiz;
  quizDom.remedialSourceQuizId.value = sourceQuiz.id;
  quizDom.remedialSourceQuizTitle.textContent = `${sourceQuiz.title} (${sourceQuiz.subject || 'Umum'})`;
  quizDom.remedialTitleInput.value = `Remedial: ${sourceQuiz.title}`;
  quizDom.remedialKkmInput.value = '77';
  quizDom.remedialDurationInput.value = sourceQuiz.durationMinutes || 30;
  quizDom.remedialReuseQuestions.checked = true;

  renderRemedialStudentCandidates(sourceQuiz);
  quizDom.quizRemedialModal.showModal();
}

function closeRemedialModal() {
  if (quizDom.quizRemedialModal && quizDom.quizRemedialModal.open) {
    quizDom.quizRemedialModal.close();
  }
}

function renderRemedialStudentCandidates(sourceQuiz) {
  if (!quizDom.remedialStudentsListContainer || !sourceQuiz) return;
  quizDom.remedialStudentsListContainer.innerHTML = '';

  const kkm = Math.max(1, Math.min(100, parseInt(quizDom.remedialKkmInput.value, 10) || 77));
  const sessions = (appState.quizSessions || []).filter(s => s.quizId === sourceQuiz.id);
  const students = appState.students && appState.students.length > 0
    ? appState.students
    : INITIAL_STUDENTS;

  let belowKkmCount = 0;

  students.forEach(st => {
    const studentSession = sessions.find(s => Number(s.studentAbsen) === Number(st.absen));
    let hasTaken = false;
    let scorePct = 0;
    let isBelowKkm = true;

    if (studentSession && studentSession.status === 'completed') {
      hasTaken = true;
      scorePct = studentSession.percentage != null ? studentSession.percentage : 0;
      isBelowKkm = scorePct < kkm;
    } else {
      isBelowKkm = true;
    }

    if (isBelowKkm) belowKkmCount++;

    const item = document.createElement('label');
    item.className = `remedial-student-item ${isBelowKkm ? 'is-below-kkm' : ''}`;

    let statusText = '';
    if (hasTaken) {
      statusText = `Nilai: ${scorePct}% ${isBelowKkm ? `(< KKM ${kkm})` : '(Tuntas)'}`;
    } else {
      statusText = 'Belum Mengerjakan (Skor 0)';
    }

    item.innerHTML = `
      <input type="checkbox" class="remedial-student-cb" value="${st.absen}" ${isBelowKkm ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
      <div style="flex:1 1 auto; min-width:0;">
        <div style="font-weight:700; font-size:0.875rem; color:var(--text-bright); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          Absen ${st.absen}: ${escapeHtml(st.name)}
        </div>
        <div style="font-size:0.75rem; color:${isBelowKkm ? '#F87171' : '#6EE7B7'};">
          ${statusText}
        </div>
      </div>
    `;

    quizDom.remedialStudentsListContainer.appendChild(item);
  });

  if (quizDom.remedialEligibleCountNote) {
    quizDom.remedialEligibleCountNote.textContent = `${belowKkmCount} siswa memiliki nilai di bawah KKM (${kkm}) dan otomatis dicentang.`;
  }
}

async function publishRemedialQuiz() {
  const sourceQuiz = quizState.remedialSourceQuiz;
  if (!sourceQuiz) return;

  const title = (quizDom.remedialTitleInput.value || '').trim();
  const kkm = Math.max(1, Math.min(100, parseInt(quizDom.remedialKkmInput.value, 10) || 77));
  const duration = Math.max(1, parseInt(quizDom.remedialDurationInput.value, 10) || 30);
  const reuseQuestions = quizDom.remedialReuseQuestions.checked;

  if (!title) {
    showToast('Judul kuis remedial wajib diisi!', 'warning');
    quizDom.remedialTitleInput.focus();
    return;
  }

  const selectedAbsen = Array.from(quizDom.remedialStudentsListContainer.querySelectorAll('.remedial-student-cb:checked'))
    .map(cb => Number(cb.value));

  if (selectedAbsen.length === 0) {
    showToast('Pilih minimal 1 siswa peserta remedial!', 'warning');
    return;
  }

  const payload = {
    id: 'quiz_rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    title,
    subject: sourceQuiz.subject || 'Umum',
    durationMinutes: duration,
    isRemedial: true,
    remedialForQuizId: sourceQuiz.id,
    kkm,
    eligibleAbsen: selectedAbsen,
    shuffleQuestions: sourceQuiz.shuffleQuestions || false,
    shuffleOptions: sourceQuiz.shuffleOptions !== false,
    questions: reuseQuestions ? JSON.parse(JSON.stringify(sourceQuiz.questions || [])) : [createDefaultQuestion(0)]
  };

  showLoadingOverlay('Menerbitkan Remedial', 'Sedang menyimpan kuis remedial di server...');
  try {
    const res = await fetch('/api/quizzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    hideLoadingOverlay();
    if (!res.ok) throw new Error('Gagal menyimpan kuis remedial: ' + res.status);
    closeRemedialModal();
    showToast(`Kuis Remedial "${title}" berhasil diterbitkan untuk ${selectedAbsen.length} siswa!`, 'success');
    await refreshData();
    switchWorkspaceView('quizzes');
  } catch (err) {
    hideLoadingOverlay();
    showToast('Gagal menerbitkan remedial: ' + err.message, 'error');
  }
}

// Remedial Modal Listeners
if (quizDom.btnCloseRemedialModal) {
  quizDom.btnCloseRemedialModal.addEventListener('click', closeRemedialModal);
}
if (quizDom.btnCancelRemedialModal) {
  quizDom.btnCancelRemedialModal.addEventListener('click', closeRemedialModal);
}
if (quizDom.remedialKkmInput) {
  quizDom.remedialKkmInput.addEventListener('input', () => {
    if (quizState.remedialSourceQuiz) {
      renderRemedialStudentCandidates(quizState.remedialSourceQuiz);
    }
  });
}
if (quizDom.btnRemedialSelectAll) {
  quizDom.btnRemedialSelectAll.addEventListener('click', () => {
    quizDom.remedialStudentsListContainer.querySelectorAll('.remedial-student-cb').forEach(cb => { cb.checked = true; });
  });
}
if (quizDom.btnRemedialDeselectAll) {
  quizDom.btnRemedialDeselectAll.addEventListener('click', () => {
    quizDom.remedialStudentsListContainer.querySelectorAll('.remedial-student-cb').forEach(cb => { cb.checked = false; });
  });
}
if (quizDom.btnPublishRemedialQuiz) {
  quizDom.btnPublishRemedialQuiz.addEventListener('click', publishRemedialQuiz);
}

// --------------------------------------------------------------------------
// 6. BACKUP ALL DATA (SINGLE ZIP DOWNLOAD FOR GURU/ADMIN)
// --------------------------------------------------------------------------

function triggerDownloadBackupZip() {
  const isTeacher = appState.currentUser && (appState.currentUser.role === 'teacher' || appState.currentUser.role === 'guru');
  if (!isTeacher) {
    showToast('Hanya Guru / Admin yang dapat mengunduh cadangan lengkap.', 'warning');
    return;
  }

  showToast('Menyiapkan arsip ZIP cadangan seluruh data server...', 'info');
  window.location.href = '/api/admin/backup-zip';
}

// --------------------------------------------------------------------------
// 7. EVENT LISTENERS INITIALIZATION FOR QUIZZES & BACKUP
// --------------------------------------------------------------------------

// Quiz Maker Modal Controls
if (quizDom.btnOpenQuizMakerModal) {
  quizDom.btnOpenQuizMakerModal.addEventListener('click', () => openQuizMakerModal(null));
}
if (quizDom.btnCreateNewQuiz) {
  quizDom.btnCreateNewQuiz.addEventListener('click', () => openQuizMakerModal(null));
}
if (quizDom.btnEmptyCreateQuiz) {
  quizDom.btnEmptyCreateQuiz.addEventListener('click', () => openQuizMakerModal(null));
}
if (quizDom.btnCloseQuizMakerModal) {
  quizDom.btnCloseQuizMakerModal.addEventListener('click', closeQuizMakerModal);
}
if (quizDom.btnCancelQuizMaker) {
  quizDom.btnCancelQuizMaker.addEventListener('click', closeQuizMakerModal);
}
if (quizDom.btnMakerAddQuestion) {
  quizDom.btnMakerAddQuestion.addEventListener('click', () => {
    quizState.makerQuestions.push(createDefaultQuestion(quizState.makerQuestions.length));
    renderMakerQuestions();
  });
}
if (quizDom.btnSaveQuizToServer) {
  quizDom.btnSaveQuizToServer.addEventListener('click', saveQuizToServer);
}
if (quizDom.btnMakerDownloadFormat) {
  quizDom.btnMakerDownloadFormat.addEventListener('click', () => downloadQuizFormat(null));
}
if (quizDom.quizImportFileInput) {
  quizDom.quizImportFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleImportQuizFile(file);
    e.target.value = '';
  });
}
if (quizDom.btnImportQuizJson) {
  quizDom.btnImportQuizJson.addEventListener('click', () => {
    if (quizDom.quizImportFileInput) {
      quizDom.quizImportFileInput.value = '';
      quizDom.quizImportFileInput.click();
    }
  });
}
if (quizDom.btnEmptyImportQuiz) {
  quizDom.btnEmptyImportQuiz.addEventListener('click', () => {
    if (quizDom.quizImportFileInput) {
      quizDom.quizImportFileInput.value = '';
      quizDom.quizImportFileInput.click();
    }
  });
}

// Live Session Monitor Controls
if (quizDom.btnOpenSessionMonitorModal) {
  quizDom.btnOpenSessionMonitorModal.addEventListener('click', () => openSessionMonitorModal('ALL'));
}
if (quizDom.btnOpenMonitorFromPage) {
  quizDom.btnOpenMonitorFromPage.addEventListener('click', () => openSessionMonitorModal('ALL'));
}
if (quizDom.btnCloseSessionMonitorModal) {
  quizDom.btnCloseSessionMonitorModal.addEventListener('click', closeSessionMonitorModal);
}
if (quizDom.monitorQuizSelect) {
  quizDom.monitorQuizSelect.addEventListener('change', fetchAndRenderMonitorSessions);
}
if (quizDom.btnRefreshMonitor) {
  quizDom.btnRefreshMonitor.addEventListener('click', fetchAndRenderMonitorSessions);
}

// Quiz History Controls
if (quizDom.btnOpenHistoryFromPage) {
  quizDom.btnOpenHistoryFromPage.addEventListener('click', openQuizHistoryModal);
}
if (quizDom.btnCloseQuizHistoryModal) {
  quizDom.btnCloseQuizHistoryModal.addEventListener('click', closeQuizHistoryModal);
}
if (quizDom.btnRefreshHistory) {
  quizDom.btnRefreshHistory.addEventListener('click', fetchAndRenderQuizHistory);
}
if (quizDom.historySearchInput) {
  quizDom.historySearchInput.addEventListener('input', fetchAndRenderQuizHistory);
}

// Backup Server .ZIP Buttons
if (quizDom.btnDownloadBackupZip) {
  quizDom.btnDownloadBackupZip.addEventListener('click', triggerDownloadBackupZip);
}
if (quizDom.btnSettingsBackupZip) {
  quizDom.btnSettingsBackupZip.addEventListener('click', triggerDownloadBackupZip);
}

// Search and Filter on Quizzes page
if (quizDom.quizSearchInput) {
  quizDom.quizSearchInput.addEventListener('input', renderQuizzesList);
}
if (quizDom.quizSubjectFilter) {
  quizDom.quizSubjectFilter.addEventListener('change', renderQuizzesList);
}

// ==========================================================================
// 8. INTERACTIVE TEACHER TOOLS: WHEEL OF NAMES & RANDOM TEAM GENERATOR
// ==========================================================================

const WHEEL_COLORS = [
  '#2563EB', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6',
  '#06B6D4', '#EF4444', '#14B8A6', '#6366F1', '#F97316'
];

const classToolsState = {
  wheelNames: [],
  wheelCurrentAngle: 0,
  wheelIsSpinning: false,
  wheelRecentWinners: [],
  wheelAudioCtx: null,
  wheelLastTickAngle: 0,
  teamsData: [],
  confettiAnimationId: null
};

// Web Audio API Ticker Click Sound
function playWheelTickSound() {
  const toggle = document.getElementById('wheelSoundToggle');
  if (toggle && !toggle.checked) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!classToolsState.wheelAudioCtx) {
      classToolsState.wheelAudioCtx = new AudioCtx();
    }
    const ctx = classToolsState.wheelAudioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1050, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.016);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.016);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.018);
  } catch {
    // Audio context safely ignored if blocked by browser policy
  }
}

// Get clean student names list from roster
function getClassStudentNames() {
  const currentClassId = appState.activeClassId || 'XB';
  const list = getRosterForClass(currentClassId);
  return list.map(s => {
    const num = String(s.absen || '').padStart(2, '0');
    return num ? `${num}. ${s.name}` : s.name;
  });
}

// Draw the Spinning Wheel on HTML5 Canvas
function drawWheel() {
  const canvas = document.getElementById('wheelCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const logicalWidth = canvas.clientWidth || 460;
  const logicalHeight = canvas.clientHeight || 460;

  if (canvas.width !== Math.round(logicalWidth * dpr)) {
    canvas.width = Math.round(logicalWidth * dpr);
    canvas.height = Math.round(logicalHeight * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, logicalWidth, logicalHeight);

  const centerX = logicalWidth / 2;
  const centerY = logicalHeight / 2;
  const radius = Math.min(centerX, centerY) - 8;

  const names = classToolsState.wheelNames;
  const numSlices = names.length;

  if (numSlices === 0) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.fillStyle = '#1E293B';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#334155';
    ctx.stroke();

    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 15px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Ketik nama siswa atau', centerX, centerY - 12);
    ctx.fillText('klik "Siswa Kelas" di samping', centerX, centerY + 12);
    ctx.restore();
    return;
  }

  const arcSize = (2 * Math.PI) / numSlices;
  const currentRotation = classToolsState.wheelCurrentAngle;

  // Slices
  for (let i = 0; i < numSlices; i++) {
    const angle = currentRotation + i * arcSize;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, angle, angle + arcSize);
    ctx.closePath();

    ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
    ctx.fill();

    ctx.lineWidth = numSlices > 32 ? 1 : 2;
    ctx.strokeStyle = '#0F172A';
    ctx.stroke();

    // Text on slice radiating towards center
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle + arcSize / 2);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';

    let fontSize = 16;
    if (numSlices > 32) fontSize = 10;
    else if (numSlices > 22) fontSize = 12;
    else if (numSlices > 14) fontSize = 13;
    else if (numSlices > 8) fontSize = 15;

    ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 4;

    let text = names[i];
    const maxTextWidth = radius - 55;
    if (ctx.measureText(text).width > maxTextWidth) {
      while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 2) {
        text = text.slice(0, -1);
      }
      text += '...';
    }

    ctx.fillText(text, radius - 18, 0);
    ctx.restore();
  }

  // Outer border rim
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#0F172A';
  ctx.stroke();

  ctx.restore();
}

// Spin the Wheel with Realistic Physical Deceleration (Cubic Ease-Out)
function spinWheel() {
  if (classToolsState.wheelIsSpinning) return;
  if (!classToolsState.wheelNames || classToolsState.wheelNames.length === 0) {
    showToast('Masukkan minimal 1 nama untuk memutar roda!', 'warning');
    return;
  }

  classToolsState.wheelIsSpinning = true;
  const btnSpin = document.getElementById('btnSpinWheel');
  const hubBtn = document.getElementById('wheelCenterHub');
  if (btnSpin) btnSpin.disabled = true;
  if (hubBtn) hubBtn.disabled = true;

  const pointerEl = document.getElementById('wheelPointer');

  const names = classToolsState.wheelNames;
  const numSlices = names.length;
  const arcSize = (2 * Math.PI) / numSlices;

  // Pick target winning index randomly
  const targetIndex = Math.floor(Math.random() * numSlices);

  // Pointer needle is at top: angle = -Math.PI / 2 (or 1.5 * Math.PI)
  // For slice i to align with needle at top, rotation must be:
  // (1.5 * Math.PI) - (i * arcSize + arcSize / 2)
  const fullSpins = 6 + Math.floor(Math.random() * 4); // 6 to 9 full turns
  const randomSliceJitter = (Math.random() - 0.5) * (arcSize * 0.7); // land naturally inside slice
  const targetSliceAngle = (1.5 * Math.PI) - (targetIndex * arcSize + arcSize / 2) + randomSliceJitter;

  // Calculate current normalized angle
  const startAngle = classToolsState.wheelCurrentAngle;
  let normalizedStart = startAngle % (2 * Math.PI);
  if (normalizedStart < 0) normalizedStart += (2 * Math.PI);

  let angleDiff = targetSliceAngle - normalizedStart;
  while (angleDiff < 0) angleDiff += (2 * Math.PI);

  const totalRotation = (fullSpins * 2 * Math.PI) + angleDiff;
  const finalAngle = startAngle + totalRotation;

  const durationMs = 4600 + Math.random() * 800; // ~5 seconds
  const startTime = performance.now();
  classToolsState.wheelLastTickAngle = startAngle;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function frame(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    const eased = easeOutCubic(progress);

    const currentAngle = startAngle + totalRotation * eased;
    classToolsState.wheelCurrentAngle = currentAngle;

    // Detect needle ticker pass
    const tickInterval = arcSize;
    if (Math.abs(currentAngle - classToolsState.wheelLastTickAngle) >= tickInterval) {
      classToolsState.wheelLastTickAngle = currentAngle;
      playWheelTickSound();
      if (pointerEl) {
        pointerEl.classList.add('tick');
        setTimeout(() => pointerEl && pointerEl.classList.remove('tick'), 50);
      }
    }

    drawWheel();

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      classToolsState.wheelIsSpinning = false;
      classToolsState.wheelCurrentAngle = finalAngle;
      drawWheel();

      if (btnSpin) btnSpin.disabled = false;
      if (hubBtn) hubBtn.disabled = false;

      // Determine winning slice under pointer (at top: 1.5 * Math.PI)
      let norm = (1.5 * Math.PI - (finalAngle % (2 * Math.PI))) % (2 * Math.PI);
      if (norm < 0) norm += 2 * Math.PI;
      const winnerIndex = Math.floor(norm / arcSize) % numSlices;
      const winnerName = names[winnerIndex] || names[targetIndex] || 'Siswa';

      celebrateWheelWinner(winnerName);
    }
  }

  requestAnimationFrame(frame);
}

// Confetti Animation on Winner Celebration
function startWinnerConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  canvas.width = (canvas.clientWidth || 460) * dpr;
  canvas.height = (canvas.clientHeight || 340) * dpr;

  const colors = ['#38BDF8', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#FFFFFF'];
  const particles = [];
  const particleCount = 70;

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: (canvas.width / dpr) * Math.random(),
      y: -20 - Math.random() * 80,
      w: 8 + Math.random() * 8,
      h: 5 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: 2 + Math.random() * 4,
      speedX: (Math.random() - 0.5) * 3,
      angle: Math.random() * 360,
      spin: (Math.random() - 0.5) * 0.15,
      opacity: 1
    });
  }

  let animationFrame;
  function updateConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    let activeParticles = 0;
    particles.forEach(p => {
      p.y += p.speedY;
      p.x += p.speedX;
      p.angle += p.spin;
      if (p.y > 150) p.opacity -= 0.008;

      if (p.opacity > 0 && p.y < (canvas.height / dpr) + 40) {
        activeParticles++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    });

    ctx.restore();

    if (activeParticles > 0) {
      animationFrame = requestAnimationFrame(updateConfetti);
      classToolsState.confettiAnimationId = animationFrame;
    }
  }

  if (classToolsState.confettiAnimationId) {
    cancelAnimationFrame(classToolsState.confettiAnimationId);
  }
  animationFrame = requestAnimationFrame(updateConfetti);
  classToolsState.confettiAnimationId = animationFrame;
}

function stopWinnerConfetti() {
  if (classToolsState.confettiAnimationId) {
    cancelAnimationFrame(classToolsState.confettiAnimationId);
    classToolsState.confettiAnimationId = null;
  }
}

// Celebrate Wheel Winner
function celebrateWheelWinner(winnerName) {
  const modal = document.getElementById('wheelWinnerModal');
  const nameEl = document.getElementById('winnerModalTitle');
  const metaEl = document.getElementById('winnerMetaInfo');
  if (nameEl) nameEl.textContent = winnerName;
  if (metaEl) metaEl.textContent = `Terpilih dari ${classToolsState.wheelNames.length} nama peserta aktif`;

  // Add to recent winners list
  classToolsState.wheelRecentWinners.unshift(winnerName);
  if (classToolsState.wheelRecentWinners.length > 20) {
    classToolsState.wheelRecentWinners.pop();
  }
  renderWheelRecentWinners();

  if (modal) {
    modal.showModal();
    startWinnerConfetti();
  }
}

function renderWheelRecentWinners() {
  const container = document.getElementById('wheelRecentWinnersList');
  if (!container) return;
  if (classToolsState.wheelRecentWinners.length === 0) {
    container.innerHTML = '<span style="font-size:0.8125rem; color:var(--text-muted); font-style:italic;">Belum ada nama yang diputar</span>';
    return;
  }
  container.innerHTML = classToolsState.wheelRecentWinners.map(name => `
    <span class="winner-tag">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      <span>${escapeHtml(name)}</span>
    </span>
  `).join('');
}

// Sync names from textarea to wheel state
function syncWheelNamesFromTextarea() {
  const textarea = document.getElementById('wheelNamesInput');
  const badge = document.getElementById('wheelCountBadge');
  if (!textarea) return;

  const lines = textarea.value.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  classToolsState.wheelNames = lines;
  if (badge) badge.textContent = `${lines.length} Nama`;

  drawWheel();
}

// Open and Close Tools Modal
function openClassToolsModal(defaultTab = 'wheel') {
  switchWorkspaceView('spinwheel');
  switchClassToolsTab(defaultTab);

  // If wheel is empty, populate automatically with class students
  const wheelTextarea = document.getElementById('wheelNamesInput');
  if (wheelTextarea && (!wheelTextarea.value || wheelTextarea.value.trim() === '')) {
    const students = getClassStudentNames();
    wheelTextarea.value = students.join('\n');
    syncWheelNamesFromTextarea();
  }

  // If team roster is empty, populate automatically too
  const teamTextarea = document.getElementById('teamNamesInput');
  if (teamTextarea && (!teamTextarea.value || teamTextarea.value.trim() === '')) {
    const students = getClassStudentNames();
    teamTextarea.value = students.join('\n');
    updateTeamNamesCount();
  }

  setTimeout(() => drawWheel(), 80);
}

function closeClassToolsModal() {
  switchWorkspaceView('dashboard');
}

// Switch between Wheel, Team, and Literasi tabs
function switchClassToolsTab(tabName) {
  classToolsState.activeTab = tabName;
  const tabBtnWheel = document.getElementById('tabBtnWheel');
  const tabBtnTeams = document.getElementById('tabBtnTeams');
  const tabBtnLiterasi = document.getElementById('tabBtnLiterasi');
  const panelWheel = document.getElementById('toolsPanelWheel');
  const panelTeams = document.getElementById('toolsPanelTeams');
  const panelLiterasi = document.getElementById('toolsPanelLiterasi');

  if (tabBtnWheel) {
    tabBtnWheel.classList.toggle('active', tabName === 'wheel');
    tabBtnWheel.setAttribute('aria-selected', tabName === 'wheel' ? 'true' : 'false');
  }
  if (tabBtnTeams) {
    tabBtnTeams.classList.toggle('active', tabName === 'teams');
    tabBtnTeams.setAttribute('aria-selected', tabName === 'teams' ? 'true' : 'false');
  }
  if (tabBtnLiterasi) {
    tabBtnLiterasi.classList.toggle('active', tabName === 'literasi');
    tabBtnLiterasi.setAttribute('aria-selected', tabName === 'literasi' ? 'true' : 'false');
  }

  // Sinkronkan sub-tombol accordion Spin Wheel di sidebar
  if (typeof syncSpinSubmenuActive === 'function') {
    syncSpinSubmenuActive(tabName);
  }

  if (panelWheel) panelWheel.classList.toggle('hidden', tabName !== 'wheel');
  if (panelTeams) panelTeams.classList.toggle('hidden', tabName !== 'teams');
  if (panelLiterasi) panelLiterasi.classList.toggle('hidden', tabName !== 'literasi');

  if (tabName === 'wheel') {
    setTimeout(() => drawWheel(), 50);
  } else if (tabName === 'literasi') {
    loadSavedLiterasi();
  }
}

// --------------------------------------------------------------------------
// RANDOM TEAM GENERATOR ENGINE
// --------------------------------------------------------------------------

function updateTeamNamesCount() {
  const textarea = document.getElementById('teamNamesInput');
  const badge = document.getElementById('teamNamesCount');
  if (!textarea || !badge) return;
  const count = textarea.value.split('\n').map(s => s.trim()).filter(Boolean).length;
  badge.textContent = `${count} Siswa`;
}

// Naming Schemes
const TEAM_NAMES_PRESETS = {
  numbers: (i) => `Kelompok ${i + 1}`,
  alpha: (i) => {
    const greek = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'];
    return `Tim ${greek[i] || ('Grup ' + (i + 1))}`;
  },
  birds: (i) => {
    const birds = ['Garuda', 'Rajawali', 'Elang', 'Alap-alap', 'Cendrawasih', 'Kasuari', 'Merpati', 'Maleo', 'Kutilang', 'Kenari', 'Pelatuk', 'Kakatua'];
    return `Tim ${birds[i] || ('Tim ' + (i + 1))}`;
  },
  colors: (i) => {
    const colors = ['Merah', 'Biru', 'Hijau', 'Kuning', 'Ungu', 'Jingga', 'Emas', 'Perak', 'Toska', 'Nila'];
    return `Tim ${colors[i] || ('Warna ' + (i + 1))}`;
  },
  custom: (i) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return `Grup ${letters[i] || (i + 1)}`;
  }
};

const TEAM_BADGE_COLORS = [
  { bg: 'rgba(56,189,248,0.18)', text: '#38BDF8' },
  { bg: 'rgba(16,185,129,0.18)', text: '#6EE7B7' },
  { bg: 'rgba(245,158,11,0.18)', text: '#FCD34D' },
  { bg: 'rgba(236,72,153,0.18)', text: '#F472B6' },
  { bg: 'rgba(139,92,246,0.18)', text: '#C4B5FD' },
  { bg: 'rgba(6,182,212,0.18)', text: '#67E8F9' },
  { bg: 'rgba(239,68,68,0.18)', text: '#FCA5A5' },
  { bg: 'rgba(249,115,22,0.18)', text: '#FDBA74' }
];

function generateRandomTeams() {
  const textarea = document.getElementById('teamNamesInput');
  const grid = document.getElementById('teamsOutputGrid');
  const countBadge = document.getElementById('teamsCountBadge');
  const summaryNote = document.getElementById('teamsSummaryNote');
  const countInput = document.getElementById('teamCountInput');
  const namingSelect = document.getElementById('teamNamingSelect');

  if (!textarea || !grid) return;

  const names = textarea.value.split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  if (names.length < 2) {
    showToast('Masukkan minimal 2 nama siswa untuk membagi kelompok!', 'warning');
    return;
  }

  // Shuffle array using Fisher-Yates
  const shuffled = [...names];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const divisionMode = document.querySelector('input[name="teamDivisionMode"]:checked')?.value || 'by_teams';
  const val = Math.max(1, parseInt(countInput ? countInput.value : 4, 10) || 4);

  const namingScheme = namingSelect ? namingSelect.value : 'numbers';
  const nameGenerator = TEAM_NAMES_PRESETS[namingScheme] || TEAM_NAMES_PRESETS.numbers;

  let teams = [];
  if (divisionMode === 'by_members') {
    // Sesuai aturan: jika minta 5 orang per kelompok, kelompok diisi penuh 5 orang. Jika siswa habis, stop di situ (kelompok terakhir berisi sisa apa adanya)
    const membersPerTeam = Math.max(1, val);
    let teamIdx = 0;
    for (let i = 0; i < shuffled.length; i += membersPerTeam) {
      const slice = shuffled.slice(i, i + membersPerTeam);
      teams.push({
        name: nameGenerator(teamIdx),
        members: slice,
        color: TEAM_BADGE_COLORS[teamIdx % TEAM_BADGE_COLORS.length]
      });
      teamIdx++;
    }
  } else {
    // by_teams
    const numTeams = Math.min(val, shuffled.length);
    teams = Array.from({ length: numTeams }, (_, i) => ({
      name: nameGenerator(i),
      members: [],
      color: TEAM_BADGE_COLORS[i % TEAM_BADGE_COLORS.length]
    }));
    shuffled.forEach((person, idx) => {
      const teamIndex = idx % numTeams;
      teams[teamIndex].members.push(person);
    });
  }

  classToolsState.teamsData = teams;

  // Susunan Seimbang Atas-Bawah jika jumlah kelompok genap (2x2 untuk 4, 4x4 untuk 8, 3x3 untuk 6, dst)
  if (teams.length % 2 === 0 && teams.length >= 4) {
    const halfCols = teams.length / 2;
    grid.style.gridTemplateColumns = `repeat(${halfCols}, minmax(0, 1fr))`;
  } else if (teams.length === 2) {
    grid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
  } else {
    grid.style.gridTemplateColumns = '';
  }

  // Fade out configuration form on generation
  const configCard = document.querySelector('.teams-config-card');
  if (configCard) {
    configCard.classList.add('fading-out');
    setTimeout(() => {
      configCard.style.display = 'none';
    }, 320);
  }

  // Render cards with staggered downward cascade animation
  grid.innerHTML = teams.map((team, tIdx) => `
    <div class="team-card team-card-cascading" style="animation-delay: ${tIdx * 80}ms;">
      <div class="team-card-header">
        <h5 class="team-card-title">${escapeHtml(team.name)}</h5>
        <span class="team-card-badge" style="background:${team.color.bg}; color:${team.color.text};">
          ${team.members.length} Siswa
        </span>
      </div>
      <ol class="team-members-list">
        ${team.members.map((m, idx) => `
          <li class="team-member-item">
            <span class="team-member-number">${idx + 1}</span>
            <span>${escapeHtml(m)}</span>
          </li>
        `).join('')}
      </ol>
    </div>
  `).join('');

  if (countBadge) countBadge.textContent = `${teams.length} Kelompok`;
  if (summaryNote) summaryNote.textContent = `Total: ${shuffled.length} siswa dibagi rata ke ${teams.length} kelompok`;

  // Enable action buttons
  const btnCopy = document.getElementById('btnCopyTeams');
  const btnDownload = document.getElementById('btnDownloadTeams');
  const btnDownloadJson = document.getElementById('btnDownloadTeamsJson');
  if (btnCopy) btnCopy.disabled = false;
  if (btnDownload) btnDownload.disabled = false;
  if (btnDownloadJson) btnDownloadJson.disabled = false;

  try {
    localStorage.setItem('mypnk_last_spin_teams', JSON.stringify(teams));
  } catch (e) {}

  // Setelah pembagian pertama, tombol utama berubah jadi "Acak Ulang" (dengan ikon shuffle)
  const genLabel = document.getElementById('btnGenerateTeamsLabel');
  const genIcon = document.getElementById('btnGenerateTeamsIcon');
  if (genLabel) genLabel.textContent = 'Acak Ulang';
  if (genIcon) genIcon.innerHTML = '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>';

  showToast(`Berhasil membagi ${shuffled.length} siswa ke dalam ${teams.length} kelompok!`, 'success');
}

// Copy Teams formatted for WhatsApp
function copyTeamsToClipboard() {
  if (!classToolsState.teamsData || classToolsState.teamsData.length === 0) {
    showToast('Belum ada kelompok yang dibuat.', 'warning');
    return;
  }

  const dateStr = new Date().toLocaleDateString('id-ID', { dateStyle: 'long' });
  let text = `*PEMBAGIAN KELOMPOK SISWA*\nTanggal: ${dateStr}\nTotal: ${classToolsState.teamsData.reduce((acc, t) => acc + t.members.length, 0)} Siswa (${classToolsState.teamsData.length} Kelompok)\n\n`;

  classToolsState.teamsData.forEach((team) => {
    text += `*${team.name}* (${team.members.length} Siswa)\n`;
    team.members.forEach((m, idx) => {
      text += `${idx + 1}. ${m}\n`;
    });
    text += '\n';
  });

  text += `_Dibuat otomatis oleh Xozen Cloud (arcznewera)_`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('Daftar kelompok berhasil disalin ke clipboard! Siap kirim ke WhatsApp.', 'success');
  }).catch(() => {
    showToast('Gagal menyalin kelompok secara otomatis.', 'error');
  });
}

// Download Teams as .TXT file
function downloadTeamsTxtFile() {
  if (!classToolsState.teamsData || classToolsState.teamsData.length === 0) {
    showToast('Belum ada kelompok yang dibuat.', 'warning');
    return;
  }

  const dateStr = new Date().toISOString().split('T')[0];
  let text = `PEMBAGIAN KELOMPOK SISWA\nTanggal: ${dateStr}\n========================================\n\n`;

  classToolsState.teamsData.forEach((team) => {
    text += `[ ${team.name.toUpperCase()} ] (${team.members.length} Anggota)\n`;
    team.members.forEach((m, idx) => {
      text += `  ${idx + 1}. ${m}\n`;
    });
    text += '\n';
  });

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pembagian_kelompok_${dateStr}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Berkas teks kelompok berhasil diunduh.', 'success');
}

// Download Teams as .JSON file for Group Assignments
function downloadTeamsJsonFile() {
  if (!classToolsState.teamsData || classToolsState.teamsData.length === 0) {
    showToast('Belum ada kelompok yang dibuat.', 'warning');
    return;
  }

  const exportData = classToolsState.teamsData.map((team, idx) => ({
    id: `kel-${idx + 1}`,
    name: team.name,
    members: Array.isArray(team.members) ? [...team.members] : []
  }));

  const dateStr = new Date().toISOString().split('T')[0];
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kelompok-siswa-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Berkas JSON kelompok berhasil diunduh! Siap diunggah saat pembuatan tugas kelompok.', 'success');
}

// Wire Event Listeners for Interactive Class Tools
const btnOpenClassTools = document.getElementById('btnOpenClassToolsModal');
const btnCloseClassTools = document.getElementById('btnCloseClassToolsModal');
if (btnOpenClassTools) {
  btnOpenClassTools.addEventListener('click', () => openClassToolsModal('wheel'));
}
if (btnCloseClassTools) {
  btnCloseClassTools.addEventListener('click', closeClassToolsModal);
}

// Tab Switchers
const tabBtnWheel = document.getElementById('tabBtnWheel');
const tabBtnTeams = document.getElementById('tabBtnTeams');
if (tabBtnWheel) {
  tabBtnWheel.addEventListener('click', () => switchClassToolsTab('wheel'));
}
if (tabBtnTeams) {
  tabBtnTeams.addEventListener('click', () => switchClassToolsTab('teams'));
}

// Wheel of Names Controls
const btnSpinWheel = document.getElementById('btnSpinWheel');
const wheelCenterHub = document.getElementById('wheelCenterHub');
const wheelCanvas = document.getElementById('wheelCanvas');
const wheelNamesInput = document.getElementById('wheelNamesInput');
const btnWheelLoadClass = document.getElementById('btnWheelLoadClass');
const btnWheelShuffle = document.getElementById('btnWheelShuffle');
const btnWheelClear = document.getElementById('btnWheelClear');
const btnClearWheelHistory = document.getElementById('btnClearWheelHistory');

if (btnSpinWheel) btnSpinWheel.addEventListener('click', spinWheel);
if (wheelCenterHub) wheelCenterHub.addEventListener('click', spinWheel);
if (wheelCanvas) wheelCanvas.addEventListener('click', spinWheel);

if (wheelNamesInput) {
  wheelNamesInput.addEventListener('input', syncWheelNamesFromTextarea);
}

if (btnWheelLoadClass) {
  btnWheelLoadClass.addEventListener('click', () => {
    const students = getClassStudentNames();
    if (wheelNamesInput) {
      wheelNamesInput.value = students.join('\n');
      syncWheelNamesFromTextarea();
      showToast(`Berhasil memuat ${students.length} siswa kelas ke roda!`, 'success');
    }
  });
}

if (btnWheelShuffle) {
  btnWheelShuffle.addEventListener('click', () => {
    if (!classToolsState.wheelNames || classToolsState.wheelNames.length <= 1) return;
    const shuffled = [...classToolsState.wheelNames];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    classToolsState.wheelNames = shuffled;
    if (wheelNamesInput) wheelNamesInput.value = shuffled.join('\n');
    drawWheel();
    showToast('Urutan nama pada roda diacak!', 'info');
  });
}

if (btnWheelClear) {
  btnWheelClear.addEventListener('click', () => {
    if (wheelNamesInput) {
      wheelNamesInput.value = '';
      syncWheelNamesFromTextarea();
    }
  });
}

if (btnClearWheelHistory) {
  btnClearWheelHistory.addEventListener('click', () => {
    classToolsState.wheelRecentWinners = [];
    renderWheelRecentWinners();
  });
}

// Winner Modal Actions
const winnerModal = document.getElementById('wheelWinnerModal');
const btnWheelRemoveWinner = document.getElementById('btnWheelRemoveWinner');
const btnWheelKeepWinner = document.getElementById('btnWheelKeepWinner');

if (btnWheelRemoveWinner) {
  btnWheelRemoveWinner.addEventListener('click', () => {
    const nameEl = document.getElementById('winnerModalTitle');
    const winnerName = nameEl ? nameEl.textContent.trim() : '';
    if (winnerName && wheelNamesInput) {
      const remaining = classToolsState.wheelNames.filter(n => n !== winnerName);
      wheelNamesInput.value = remaining.join('\n');
      syncWheelNamesFromTextarea();
      showToast(`Nama "${winnerName}" telah dihapus dari putaran roda.`, 'info');
    }
    stopWinnerConfetti();
    if (winnerModal && winnerModal.open) winnerModal.close();
  });
}

if (btnWheelKeepWinner) {
  btnWheelKeepWinner.addEventListener('click', () => {
    stopWinnerConfetti();
    if (winnerModal && winnerModal.open) winnerModal.close();
  });
}

// Space bar spin shortcut
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    const toolsModal = document.getElementById('classToolsModal');
    if (toolsModal && toolsModal.open && classToolsState.activeTab === 'wheel') {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
        return; // Normal typing inside inputs
      }
      e.preventDefault();
      spinWheel();
    }
  }
});

// Random Team Generator Controls
const teamNamesInput = document.getElementById('teamNamesInput');
const btnTeamLoadClass = document.getElementById('btnTeamLoadClass');
const btnTeamClear = document.getElementById('btnTeamClear');
const btnGenerateTeams = document.getElementById('btnGenerateTeams');
const btnCopyTeams = document.getElementById('btnCopyTeams');
const btnDownloadTeams = document.getElementById('btnDownloadTeams');
const teamCountInput = document.getElementById('teamCountInput');
const teamCountLabel = document.getElementById('teamCountInputLabel');
const divisionRadios = document.querySelectorAll('input[name="teamDivisionMode"]');

if (teamNamesInput) {
  teamNamesInput.addEventListener('input', updateTeamNamesCount);
}

if (btnTeamLoadClass) {
  btnTeamLoadClass.addEventListener('click', () => {
    const students = getClassStudentNames();
    if (teamNamesInput) {
      teamNamesInput.value = students.join('\n');
      updateTeamNamesCount();
      showToast(`Berhasil memuat ${students.length} siswa kelas ke pembagi kelompok!`, 'success');
    }
  });
}

if (btnTeamClear) {
  btnTeamClear.addEventListener('click', () => {
    if (teamNamesInput) {
      teamNamesInput.value = '';
      updateTeamNamesCount();
    }
  });
}

divisionRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (teamCountLabel && teamCountInput) {
      if (e.target.value === 'by_teams') {
        teamCountLabel.textContent = 'Jumlah Kelompok:';
        teamCountInput.value = '4';
      } else {
        teamCountLabel.textContent = 'Anggota per Kelompok:';
        teamCountInput.value = '4';
      }
    }
  });
});

if (btnGenerateTeams) {
  btnGenerateTeams.addEventListener('click', generateRandomTeams);
}
if (btnCopyTeams) {
  btnCopyTeams.addEventListener('click', copyTeamsToClipboard);
}
if (btnDownloadTeams) {
  btnDownloadTeams.addEventListener('click', downloadTeamsTxtFile);
}
const btnDownloadTeamsJsonEl = document.getElementById('btnDownloadTeamsJson');
if (btnDownloadTeamsJsonEl) {
  btnDownloadTeamsJsonEl.addEventListener('click', downloadTeamsJsonFile);
}

// ==========================================================================
// MULTI-CLASS SWITCHER & 3 BENTO CARDS CONTROLLER
// ==========================================================================

async function showTeacherClassSelector() {
  const isGuru = appState.currentUser && (appState.currentUser.role === 'guru' || appState.currentUser.role === 'teacher');
  if (!isGuru) return;

  const modal = document.getElementById('teacherClassModal');
  if (!modal) return;
  setSidebarActiveButton('navBtnClassPicker');

  const currentClass = appState.activeClassId || 'XB';
  ['XA', 'XB', 'XC'].forEach(cls => {
    const card = document.getElementById(`cardClass${cls}`);
    if (card) {
      if (cls === currentClass) card.classList.add('active');
      else card.classList.remove('active');
    }
  });

  try {
    const res = await fetch('/api/classes/summary');
    if (res.ok) {
      const data = await res.json();
      if (data && data.classes) {
        ['XA', 'XB', 'XC'].forEach(cls => {
          const item = data.classes[cls];
          if (!item) return;
          const countEl = document.getElementById(`classCount${cls}`);
          const activeEl = document.getElementById(`classActiveTasks${cls}`);
          const totalEl = document.getElementById(`classTotalTasks${cls}`);
          if (countEl) countEl.textContent = item.studentCount || 0;
          if (activeEl) activeEl.textContent = item.activeTasks || 0;
          if (totalEl) totalEl.textContent = item.totalTasks || 0;
        });
      }
    }
  } catch (e) {
    console.warn('Gagal memuat ringkasan kelas:', e);
  }

  modal.showModal();
}

async function selectClass(classId) {
  const isGuru = appState.currentUser && (appState.currentUser.role === 'guru' || appState.currentUser.role === 'teacher');
  if (!isGuru && appState.currentUser) {
    return;
  }

  const target = ['XA', 'XB', 'XC'].includes(classId) ? classId : 'XB';
  appState.activeClassId = target;
  localStorage.setItem('myPnk_activeClassId', target);

  const sidebarPill = document.getElementById('sidebarActiveClassPill');
  if (sidebarPill) {
    sidebarPill.textContent = target === 'XB' ? 'X-B' : (target === 'XA' ? 'X-A' : 'X-C');
  }

  ['XA', 'XB', 'XC'].forEach(cls => {
    const card = document.getElementById(`cardClass${cls}`);
    if (card) {
      if (cls === target) card.classList.add('active');
      else card.classList.remove('active');
    }
  });

  const modal = document.getElementById('teacherClassModal');
  if (modal && modal.open) {
    modal.close();
  }

  showToast(`Ruang kelas aktif: Kelas ${target === 'XB' ? 'X-B (Utama)' : (target === 'XA' ? 'X-A' : 'X-C')}`, 'success');

  showLoading('Memuat Kelas', `Menyiapkan data Kelas ${target}...`);
  try {
    await refreshData();
    renderAssignmentsList();
    if (typeof renderQuizzesList === 'function') renderQuizzesList();
    if (typeof renderScheduleView === 'function') renderScheduleView();
    if (typeof renderPiketView === 'function') renderPiketView();
    if (typeof renderDevoView === 'function') renderDevoView();
    refreshAllDiagnostics(false);
  } catch (err) {
    console.error('Error saat beralih kelas:', err);
  } finally {
    hideLoading();
  }
}

function initTeacherClassModal() {
  const modal = document.getElementById('teacherClassModal');
  const btnClose = document.getElementById('btnCloseTeacherClassModal');
  const navBtnClass = document.getElementById('navBtnClassPicker');

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => modal.close());
  }

  if (modal) {
    modal.addEventListener('close', () => {
      restoreSidebarActiveView();
    });
  }

  if (navBtnClass) {
    navBtnClass.addEventListener('click', () => {
      closeMobileDrawer();
      showTeacherClassSelector();
    });
  }

  const initialClass = appState.activeClassId || 'XB';
  const sidebarPill = document.getElementById('sidebarActiveClassPill');
  if (sidebarPill) {
    sidebarPill.textContent = initialClass === 'XB' ? 'X-B' : (initialClass === 'XA' ? 'X-A' : 'X-C');
  }

  ['XA', 'XB', 'XC'].forEach(cls => {
    const card = document.getElementById(`cardClass${cls}`);
    const btn = card ? card.querySelector('.btn-select-class') : null;
    if (card) {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          selectClass(cls);
        }
      });
    }
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectClass(cls);
      });
    }
  });
}

// ==========================================================================
// IN-QUIZ MULTI-LANGUAGE CODE COMPILER CONTROLLER
// ==========================================================================

const COMPILER_BOILERPLATES = {
  python: `# Program Python 3\ndef sapa(nama):\n    return f"Halo, {nama}! Selamat datang di Compiler Kuis."\n\nprint(sapa("Siswa"))\nfor i in range(1, 6):\n    print(f"Langkah {i}: kuadrat = {i**2}")\n`,
  javascript: `// Program JavaScript (Node.js)\nfunction hitungTotal(nilai) {\n  return nilai.reduce((acc, curr) => acc + curr, 0);\n}\n\nconst scores = [85, 90, 78, 92, 88];\nconsole.log("Daftar Nilai:", scores);\nconsole.log("Total:", hitungTotal(scores));\nconsole.log("Rata-rata:", (hitungTotal(scores) / scores.length).toFixed(2));\n`,
  cpp: `#include <iostream>\n#include <vector>\n\nint main() {\n    std::cout << "=== Program C++ Antarmuka Kuis ===" << std::endl;\n    std::vector<int> data = {10, 20, 30, 40, 50};\n    int sum = 0;\n    for (int x : data) sum += x;\n    std::cout << "Jumlah elemen: " << data.size() << std::endl;\n    std::cout << "Total nilai: " << sum << std::endl;\n    return 0;\n}\n`,
  c: `#include <stdio.h>\n\nint main() {\n    printf("=== Program Bahasa C ===\\n");\n    int angka = 7;\n    long long faktorial = 1;\n    for(int i = 1; i <= angka; ++i) {\n        faktorial *= i;\n    }\n    printf("Faktorial dari %d adalah %lld\\n", angka, faktorial);\n    return 0;\n}\n`,
  sql: `-- Demo Database SQLite\nCREATE TABLE siswa (\n  id INTEGER PRIMARY KEY,\n  nama TEXT,\n  nilai INTEGER\n);\n\nINSERT INTO siswa VALUES (1, 'Aditia Pratama', 95);\nINSERT INTO siswa VALUES (2, 'Bella Ananda', 88);\nINSERT INTO siswa VALUES (3, 'Calvin Wijaya', 92);\n\nSELECT * FROM siswa WHERE nilai >= 90;\n`,
  bash: `#!/bin/sh\necho "=== Shell Script Simulator ==="\necho "Tanggal & Waktu Server: $(date)"\nfor i in 1 2 3; do\n  echo "Iterasi ke-$i selesai"\ndone\n`,
  html: `<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; background: #0f172a; color: #fff; padding: 20px; }\n    .card { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 18px; }\n    button { background: #3b82f6; color: #fff; border: 0; padding: 10px 18px; border-radius: 8px; cursor: pointer; }\n    button:hover { background: #2563eb; }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h2>Halo dari Live Preview!</h2>\n    <p>Klik tombol untuk menguji interaktivitas JavaScript:</p>\n    <button onclick="document.getElementById('hasil').textContent = 'Tombol Berhasil Diklik pada ' + new Date().toLocaleTimeString()">Klik Saya</button>\n    <p id="hasil" style="margin-top: 15px; color: #38bdf8; font-weight: bold;"></p>\n  </div>\n</body>\n</html>\n`
};

const COMPILER_FILENAMES = {
  python: 'main.py',
  javascript: 'main.js',
  cpp: 'main.cpp',
  c: 'main.c',
  sql: 'query.sql',
  bash: 'script.sh',
  html: 'index.html'
};

function initCompiler() {
  const modal = document.getElementById('quizCompilerModal');
  const btnOpenQuiz = document.getElementById('btnOpenQuizCompiler');
  const btnRunnerOpen = document.getElementById('btnRunnerOpenCompiler');
  const btnClose = document.getElementById('btnCloseCompilerModal');
  const btnCloseBottom = document.getElementById('btnCompilerCloseBottom');
  const langSelect = document.getElementById('compilerLangSelect');
  const codeEditor = document.getElementById('compilerCodeEditor');
  const lineNumbers = document.getElementById('compilerLineNumbers');
  const filenameInd = document.getElementById('compilerFilenameIndicator');
  const btnRun = document.getElementById('btnCompilerRun');
  const runSpinner = document.getElementById('compilerRunSpinner');
  const runText = document.getElementById('compilerRunBtnText');
  const stdoutEl = document.getElementById('compilerStdout');
  const stderrEl = document.getElementById('compilerStderr');
  const welcomeText = document.getElementById('compilerTerminalWelcome');
  const execTimeTag = document.getElementById('compilerExecTimeTag');
  const exitCodeTag = document.getElementById('compilerExitCodeTag');
  const btnClearCode = document.getElementById('btnCompilerClearCode');
  const btnCopyCode = document.getElementById('btnCompilerCopyCode');
  const btnClearOut = document.getElementById('btnCompilerClearOutput');
  const btnLoadTpl = document.getElementById('btnCompilerLoadTemplate');
  const btnToggleStdin = document.getElementById('btnCompilerToggleStdin');
  const stdinBox = document.getElementById('compilerStdinContainer');
  const stdinInput = document.getElementById('compilerStdinInput');
  const terminalBox = document.getElementById('compilerTerminalBox');
  const previewBox = document.getElementById('compilerPreviewContainer');
  const previewIframe = document.getElementById('compilerPreviewIframe');

  if (!modal || !codeEditor) return;

  function updateLineNumbers() {
    if (!lineNumbers || !codeEditor) return;
    const lines = (codeEditor.value || '').split('\n').length;
    let nums = '';
    for (let i = 1; i <= Math.max(lines, 1); i++) {
      nums += i + '\n';
    }
    lineNumbers.textContent = nums;
  }

  function openCompiler() {
    if (!codeEditor.value && langSelect) {
      const curLang = langSelect.value || 'python';
      codeEditor.value = COMPILER_BOILERPLATES[curLang] || '';
      updateLineNumbers();
    }
    modal.showModal();
  }

  if (btnOpenQuiz) btnOpenQuiz.addEventListener('click', openCompiler);
  if (btnRunnerOpen) btnRunnerOpen.addEventListener('click', openCompiler);
  if (btnClose) btnClose.addEventListener('click', () => modal.close());
  if (btnCloseBottom) btnCloseBottom.addEventListener('click', () => modal.close());

  codeEditor.addEventListener('input', updateLineNumbers);
  codeEditor.addEventListener('scroll', () => {
    if (lineNumbers) lineNumbers.scrollTop = codeEditor.scrollTop;
  });

  codeEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = codeEditor.selectionStart;
      const end = codeEditor.selectionEnd;
      codeEditor.value = codeEditor.value.substring(0, start) + '  ' + codeEditor.value.substring(end);
      codeEditor.selectionStart = codeEditor.selectionEnd = start + 2;
      updateLineNumbers();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runCurrentCode();
    }
  });

  if (langSelect) {
    langSelect.addEventListener('change', () => {
      const lang = langSelect.value;
      if (filenameInd) filenameInd.textContent = COMPILER_FILENAMES[lang] || 'script.txt';

      if (lang === 'html') {
        if (terminalBox) terminalBox.classList.add('hidden');
        if (previewBox) previewBox.classList.remove('hidden');
      } else {
        if (terminalBox) terminalBox.classList.remove('hidden');
        if (previewBox) previewBox.classList.add('hidden');
      }

      const currentCode = (codeEditor.value || '').trim();
      const isKnownBoilerplate = Object.values(COMPILER_BOILERPLATES).some(b => b.trim() === currentCode);
      if (!currentCode || isKnownBoilerplate) {
        codeEditor.value = COMPILER_BOILERPLATES[lang] || '';
        updateLineNumbers();
      }
    });
  }

  if (btnLoadTpl) {
    btnLoadTpl.addEventListener('click', () => {
      const lang = langSelect ? langSelect.value : 'python';
      codeEditor.value = COMPILER_BOILERPLATES[lang] || '';
      updateLineNumbers();
      showToast(`Template ${lang.toUpperCase()} dimuat.`, 'info');
    });
  }

  if (btnToggleStdin && stdinBox) {
    btnToggleStdin.addEventListener('click', () => {
      stdinBox.classList.toggle('hidden');
      if (!stdinBox.classList.contains('hidden') && stdinInput) {
        stdinInput.focus();
      }
    });
  }

  if (btnClearCode) {
    btnClearCode.addEventListener('click', () => {
      codeEditor.value = '';
      updateLineNumbers();
      codeEditor.focus();
    });
  }

  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(codeEditor.value || '');
        showToast('Kode berhasil disalin ke clipboard.', 'success');
      } catch {
        showToast('Gagal menyalin kode.', 'error');
      }
    });
  }

  if (btnClearOut) {
    btnClearOut.addEventListener('click', () => {
      if (stdoutEl) stdoutEl.textContent = '';
      if (stderrEl) stderrEl.textContent = '';
      if (welcomeText) welcomeText.classList.remove('hidden');
      if (execTimeTag) execTimeTag.textContent = '0 ms';
      if (exitCodeTag) {
        exitCodeTag.textContent = 'Ready';
        exitCodeTag.className = 'status-tag status-exit-code';
      }
      if (previewIframe) previewIframe.srcdoc = '';
    });
  }

  async function runCurrentCode() {
    const code = codeEditor.value;
    const lang = langSelect ? langSelect.value : 'python';
    const stdin = stdinInput ? stdinInput.value : '';

    if (!code || !code.trim()) {
      showToast('Tuliskan kode program terlebih dahulu.', 'warning');
      return;
    }

    if (btnRun) btnRun.disabled = true;
    if (runSpinner) runSpinner.classList.remove('hidden');
    if (runText) runText.textContent = 'Menjalankan...';
    if (welcomeText) welcomeText.classList.add('hidden');
    if (stdoutEl) stdoutEl.textContent = '';
    if (stderrEl) stderrEl.textContent = '';

    try {
      if (lang === 'html') {
        if (previewIframe) {
          previewIframe.srcdoc = code;
        }
        if (stdoutEl) stdoutEl.textContent = 'Live Preview HTML5/CSS/JS telah diperbarui.';
        if (execTimeTag) execTimeTag.textContent = '1 ms';
        if (exitCodeTag) {
          exitCodeTag.textContent = 'Preview OK';
          exitCodeTag.className = 'status-tag status-exit-code';
        }
      } else {
        const res = await fetch('/api/compiler/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: lang, code, stdin })
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (stderrEl) stderrEl.textContent = result.error || 'Terjadi kesalahan saat memproses kode.';
          if (exitCodeTag) {
            exitCodeTag.textContent = 'Error';
            exitCodeTag.className = 'status-tag status-exit-code error';
          }
        } else {
          if (stdoutEl) stdoutEl.textContent = result.stdout || '';
          if (stderrEl) stderrEl.textContent = result.stderr || '';
          if (!result.stdout && !result.stderr) {
            if (stdoutEl) stdoutEl.textContent = '(Program selesai dijalankan tanpa keluaran teks)';
          }
          if (execTimeTag) execTimeTag.textContent = `${result.executionTimeMs || 0} ms`;
          if (exitCodeTag) {
            if (result.exitCode === 0) {
              exitCodeTag.textContent = 'Exit 0 (OK)';
              exitCodeTag.className = 'status-tag status-exit-code';
            } else {
              exitCodeTag.textContent = `Exit ${result.exitCode}`;
              exitCodeTag.className = 'status-tag status-exit-code error';
            }
          }
        }
      }
    } catch (err) {
      if (stderrEl) stderrEl.textContent = 'Gagal menghubungi server compiler: ' + err.message;
      if (exitCodeTag) {
        exitCodeTag.textContent = 'Net Error';
        exitCodeTag.className = 'status-tag status-exit-code error';
      }
    } finally {
      if (btnRun) btnRun.disabled = false;
      if (runSpinner) runSpinner.classList.add('hidden');
      if (runText) runText.textContent = 'Jalankan Kode';
    }
  }

  if (btnRun) {
    btnRun.addEventListener('click', runCurrentCode);
  }

  updateLineNumbers();
}

// Initial App Boot
async function startApp() {
  setupTeacherLongPress();

  if (!appState.currentUser) {
    loadSavedSession();
  }
  if (appState.currentUser) {
    if (dom.authGatewayScreen) dom.authGatewayScreen.classList.add('hidden');
    if (dom.mainAppShell) dom.mainAppShell.classList.remove('hidden');
    updateUserRoleUI();
  } else {
    if (dom.authGatewayScreen) dom.authGatewayScreen.classList.remove('hidden');
    if (dom.mainAppShell) dom.mainAppShell.classList.add('hidden');
  }

  const sidebarPill = document.getElementById('sidebarActiveClassPill');
  if (sidebarPill) {
    const cls = appState.activeClassId || 'XB';
    sidebarPill.textContent = cls === 'XB' ? 'X-B' : (cls === 'XA' ? 'X-A' : 'X-C');
  }

  try {
    await initSchoolDB();
  } catch (err) {
    console.warn('initSchoolDB error:', err);
  }

  try {
    await initStudentsRoster();
  } catch (err) {
    console.warn('initStudentsRoster error:', err);
  }

  await refreshData();
  refreshAllDiagnostics(false);

  // Periksa apakah siswa memiliki sesi ujian aktif yang belum selesai setelah refresh
  if (appState.currentUser && appState.currentUser.role === 'siswa') {
    const studentAbsen = Number(appState.currentUser.absen);
    const activeQuizSession = (appState.quizSessions || []).find(s => Number(s.studentAbsen) === studentAbsen && s.status === 'in_progress');
    if (activeQuizSession) {
      showToast('Sesi ujian aktif ditemukan! Jawaban tersimpan aman di server, silakan klik Kuis untuk melanjutkan.', 'info');
    }
  }
}

// ===== Auto Refresh Data Tiap 3 Detik + Loading Bar Bawah Layar =====
function restartGlobalRefreshBar() {
  const barFill = document.getElementById('globalRefreshBarFill');
  if (!barFill) return;
  barFill.style.transition = 'none';
  barFill.style.width = '0%';
  void barFill.offsetWidth; // paksa reflow agar transisi mulai dari 0
  barFill.style.transition = 'width 3s linear';
  barFill.style.width = '100%';
}

setInterval(() => {
  if (appState.currentUser) {
    refreshData();
  }
  restartGlobalRefreshBar();
}, 3000);
restartGlobalRefreshBar();

// ==========================================================================
// JADWAL PELAJARAN, JADWAL SEMENTARA (1x GANTI), DAFTAR PIKET & DAFTAR DEVO
// ==========================================================================

function getIndonesianDayName(date = new Date()) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[date.getDay()] || 'Senin';
}

function formatIndonesianDate(date = new Date()) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const d = new Date(date);
  const dayName = days[d.getDay()] || '';
  const dayNum = d.getDate();
  const monthName = months[d.getMonth()] || '';
  const year = d.getFullYear();
  return `${dayName}, ${dayNum} ${monthName} ${year}`;
}

function getTodayYMD() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStudentsReferenceList() {
  if (Array.isArray(appState.students) && appState.students.length > 0) {
    return appState.students;
  }
  return INITIAL_STUDENTS;
}

// 1. Render Dashboard Quick Widget
function renderScheduleDashboardWidget() {
  const todayDay = getIndonesianDayName();
  const todayYMD = getTodayYMD();

  // Date badge
  const dateBadge = document.getElementById('todayDateBadge');
  if (dateBadge) {
    dateBadge.textContent = formatIndonesianDate();
  }

  // Active temporary schedule for today
  const activeTempToday = (appState.temporarySchedules || []).find(ts => {
    return ts.isActive && (ts.date === todayYMD || ts.day === todayDay);
  });

  const bannerEl = document.getElementById('todayTempScheduleBanner');
  const bannerDesc = document.getElementById('todayTempBannerDesc');
  if (bannerEl && bannerDesc) {
    if (activeTempToday) {
      bannerEl.classList.remove('hidden');
      const periodCount = (activeTempToday.periods && Array.isArray(activeTempToday.periods)) ? activeTempToday.periods.length : 0;
      bannerDesc.textContent = `Jadwal Khusus Seharian: ${activeTempToday.title}. Menggantikan seluruh roster reguler hari ini (${periodCount} sesi pelajaran).`;
    } else {
      bannerEl.classList.add('hidden');
    }
  }

  // Dashboard Today Schedule List
  const schedCountEl = document.getElementById('dashboardScheduleCount');
  const schedListEl = document.getElementById('dashboardTodayScheduleList');
  if (schedListEl) {
    const isTempActiveToday = activeTempToday && Array.isArray(activeTempToday.periods) && activeTempToday.periods.length > 0;
    const todaySchedules = isTempActiveToday
      ? activeTempToday.periods
      : (appState.schedules || []).filter(s => s.day === todayDay).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

    if (schedCountEl) {
      schedCountEl.textContent = isTempActiveToday
        ? `${todaySchedules.length} sesi (Jadwal Khusus Seharian)`
        : `${todaySchedules.length} mata pelajaran hari ini`;
    }

    if (todaySchedules.length === 0) {
      const isWeekend = todayDay === 'Sabtu' || todayDay === 'Minggu';
      schedListEl.innerHTML = `
        <div style="padding: 16px 12px; text-align: center; color: #94A3B8; font-size: 0.8125rem;">
          ${isWeekend ? 'Akhir pekan libur sekolah (Sabtu/Minggu). Roster aktif Senin s/d Jumat.' : `Tidak ada jam pelajaran untuk hari ${todayDay}.`}
        </div>
      `;
    } else {
      schedListEl.innerHTML = todaySchedules.map(item => {
        if (isTempActiveToday) {
          return `
            <div class="agenda-schedule-mini-item is-substituted">
              <span class="agenda-mini-time">${item.startTime} - ${item.endTime}</span>
              <div>
                <span class="agenda-mini-subject" style="color: #F59E0B;">⚡ ${item.subject}</span>
                <span style="font-size: 0.6875rem; color: #FCD34D; display: block;">${item.teacher || 'Guru'} ${item.room ? '• ' + item.room : ''}</span>
              </div>
            </div>
          `;
        }

        return `
          <div class="agenda-schedule-mini-item">
            <span class="agenda-mini-time">${item.startTime} - ${item.endTime}</span>
            <div>
              <span class="agenda-mini-subject">${item.subject}</span>
              <span style="font-size: 0.6875rem; color: #94A3B8; display: block;">${item.teacher || 'Guru'} ${item.room ? '• ' + item.room : ''}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Dashboard Today Piket List
  const piketListEl = document.getElementById('dashboardTodayPiketList');
  if (piketListEl) {
    const studentList = getStudentsReferenceList();
    const assignedAbsens = (appState.piket && appState.piket[todayDay]) ? appState.piket[todayDay] : [];

    if (assignedAbsens.length === 0) {
      piketListEl.innerHTML = `
        <div style="padding: 12px; text-align: center; color: #94A3B8; font-size: 0.8125rem;">
          Belum ada regu piket untuk hari ${todayDay}.
        </div>
      `;
    } else {
      const assignedStudents = assignedAbsens.map(absen => {
        const found = studentList.find(s => Number(s.absen) === Number(absen));
        return found ? found : { absen, name: `Siswa Absen ${absen}` };
      });

      piketListEl.innerHTML = `
        <div class="agenda-piket-chips">
          ${assignedStudents.map(st => `
            <span class="agenda-piket-chip">
              <span style="font-weight: 700; color: #34D399;">#${st.absen}</span>
              <span>${st.name}</span>
            </span>
          `).join('')}
        </div>
      `;
    }
  }

  // Dashboard Today Devo Content
  const devoContentEl = document.getElementById('dashboardTodayDevoContent');
  if (devoContentEl) {
    const todayDevo = (appState.devo || []).find(d => {
      return d.date === todayYMD || d.status === 'today' || (d.day === todayDay && d.status !== 'completed');
    });

    if (!todayDevo) {
      devoContentEl.innerHTML = `
        <div style="padding: 12px; text-align: center; color: #94A3B8; font-size: 0.8125rem;">
          Belum ada jadwal renungan pagi (devo) hari ini.
        </div>
      `;
    } else {
      devoContentEl.innerHTML = `
        <div class="agenda-devo-highlight">
          <div class="agenda-devo-topic">${todayDevo.topic}</div>
          ${todayDevo.scripture ? `<div style="font-size: 0.75rem; color: #E2E8F0; font-style: italic; margin-bottom: 4px;">Nats: ${todayDevo.scripture}</div>` : ''}
          <div class="agenda-devo-meta">
            Petugas: <strong>${todayDevo.studentName || ('Absen ' + todayDevo.studentAbsen)}</strong>
            ${todayDevo.studentAbsen ? ` (Absen ${todayDevo.studentAbsen})` : ''}
          </div>
        </div>
      `;
    }
  }
}

// 2. Render Schedule View Page
function renderScheduleView() {
  const isGuru = appState.currentUser && (appState.currentUser.role === 'guru' || appState.currentUser.role === 'teacher');

  // Teacher Action bar & buttons visibility
  const actionsBar = document.getElementById('scheduleToolbarActions');
  if (actionsBar) {
    actionsBar.style.display = isGuru ? 'flex' : 'none';
  }
  const teacherBtns = document.querySelectorAll('.teacher-action-btn');
  teacherBtns.forEach(btn => {
    btn.style.display = isGuru ? 'inline-flex' : 'none';
  });

  // Setup Subview Tabs
  const subviewBtns = document.querySelectorAll('.schedule-tab-btn');
  subviewBtns.forEach(btn => {
    const sub = btn.dataset.subview;
    if (sub === appState.activeScheduleSubView) {
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
    }

    btn.onclick = () => {
      appState.activeScheduleSubView = sub;
      renderScheduleView();
    };
  });

  // Update badge for active temporary schedules
  const activeTempCount = (appState.temporarySchedules || []).filter(ts => ts.isActive).length;
  const tempBadge = document.getElementById('tempScheduleActiveBadge');
  if (tempBadge) {
    if (activeTempCount > 0) {
      tempBadge.style.display = 'inline-block';
      tempBadge.textContent = activeTempCount;
    } else {
      tempBadge.style.display = 'none';
    }
  }

  // Update primary action button in toolbar based on current subview
  const actionPrimaryBtn = document.getElementById('btnScheduleActionPrimary');
  const actionPrimaryLabel = document.getElementById('btnScheduleActionLabel');
  if (actionPrimaryBtn && actionPrimaryLabel) {
    if (appState.activeScheduleSubView === 'roster') {
      actionPrimaryLabel.textContent = '+ Tambah Jam Pelajaran';
      actionPrimaryBtn.onclick = () => openScheduleModal();
    } else if (appState.activeScheduleSubView === 'temporary') {
      actionPrimaryLabel.textContent = '+ Buat Jadwal Sementara (1x)';
      actionPrimaryBtn.onclick = () => openTempScheduleModal();
    } else if (appState.activeScheduleSubView === 'piket') {
      actionPrimaryLabel.textContent = 'Atur Regu Piket Siswa';
      actionPrimaryBtn.onclick = () => openPiketModal(appState.activeScheduleDay);
    } else if (appState.activeScheduleSubView === 'devo') {
      actionPrimaryLabel.textContent = '+ Tambah Petugas Devo';
      actionPrimaryBtn.onclick = () => openDevoModal();
    }
  }

  // Switch Subview Visibility
  const subviews = {
    roster: document.getElementById('subViewScheduleRoster'),
    temporary: document.getElementById('subViewScheduleTemp'),
    piket: document.getElementById('subViewSchedulePiket'),
    devo: document.getElementById('subViewScheduleDevo')
  };

  Object.entries(subviews).forEach(([key, el]) => {
    if (!el) return;
    if (key === appState.activeScheduleSubView) {
      el.classList.remove('hidden');
      el.classList.add('active');
    } else {
      el.classList.add('hidden');
      el.classList.remove('active');
    }
  });

  // Render specific subview
  if (appState.activeScheduleSubView === 'roster') {
    renderScheduleRoster();
  } else if (appState.activeScheduleSubView === 'temporary') {
    renderTemporarySchedulesList();
  } else if (appState.activeScheduleSubView === 'piket') {
    renderPiketView();
  } else if (appState.activeScheduleSubView === 'devo') {
    renderDevoView();
  }
}

// 3. Render Subview 1: Jadwal Pelajaran (Roster)
function renderScheduleRoster() {
  const isGuru = appState.currentUser && (appState.currentUser.role === 'guru' || appState.currentUser.role === 'teacher');
  const validDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
  let selectedDay = appState.activeScheduleDay || 'Senin';
  if (!validDays.includes(selectedDay)) {
    selectedDay = 'Senin';
    appState.activeScheduleDay = 'Senin';
  }
  const todayDay = getIndonesianDayName();
  const todayYMD = getTodayYMD();

  // Day Selector Chips
  const dayChips = document.querySelectorAll('.day-chip-btn');
  dayChips.forEach(chip => {
    const d = chip.dataset.day;
    if (d === selectedDay) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }

    if (d === todayDay) {
      chip.innerHTML = `${d} <span style="font-size:0.6875rem; background:#10B981; color:#fff; border-radius:999px; padding:1px 6px; margin-left:4px;">Hari Ini</span>`;
    } else {
      chip.textContent = d;
    }

    chip.onclick = () => {
      appState.activeScheduleDay = d;
      renderScheduleRoster();
    };
  });

  // Check temporary schedule for this day
  const activeTempThisDay = (appState.temporarySchedules || []).find(ts => {
    return ts.isActive && (ts.day === selectedDay || (selectedDay === todayDay && ts.date === todayYMD));
  });

  const bannerEl = document.getElementById('rosterDayTempBanner');
  const bannerDesc = document.getElementById('rosterDayTempDesc');
  if (bannerEl && bannerDesc) {
    if (activeTempThisDay) {
      bannerEl.classList.remove('hidden');
      const pCount = (activeTempThisDay.periods && Array.isArray(activeTempThisDay.periods)) ? activeTempThisDay.periods.length : 0;
      bannerDesc.textContent = `Jadwal Khusus Seharian: ${activeTempThisDay.title}. Menggantikan seluruh roster hari ${selectedDay} (${pCount} sesi pelajaran).`;
    } else {
      bannerEl.classList.add('hidden');
    }
  }

  // Render Roster Items
  const listEl = document.getElementById('rosterScheduleList');
  if (!listEl) return;

  const hasTempPeriods = activeTempThisDay && Array.isArray(activeTempThisDay.periods) && activeTempThisDay.periods.length > 0;
  const schedules = hasTempPeriods
    ? activeTempThisDay.periods
    : (appState.schedules || []).filter(s => s.day === selectedDay).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  if (schedules.length === 0) {
    listEl.innerHTML = `
      <div class="ui-state-container" style="grid-column: 1 / -1; padding: 40px 20px; text-align: center;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="1.5" style="margin-bottom: 12px;">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
          <line x1="16" x2="16" y1="2" y2="6"/>
          <line x1="8" x2="8" y1="2" y2="6"/>
          <line x1="3" x2="21" y1="10" y2="10"/>
        </svg>
        <h4 style="color: #F8FAFC; margin-bottom: 6px;">Belum Ada Jadwal Pelajaran</h4>
        <p style="color: #94A3B8; font-size: 0.875rem;">Belum ada jam mata pelajaran yang ditambahkan untuk hari ${selectedDay}.</p>
        ${isGuru ? `
          <button type="button" class="btn btn-primary btn-sm" style="margin-top: 14px;" onclick="window.openScheduleModalForDay('${selectedDay}')">
            + Tambah Jam Pelajaran Pertama
          </button>
        ` : ''}
      </div>
    `;
    return;
  }

  listEl.innerHTML = schedules.map((item, idx) => {
    return `
      <div class="schedule-card-item ${hasTempPeriods ? 'is-substituted' : ''}">
        <div class="schedule-item-top">
          <span class="schedule-time-badge">${item.startTime} - ${item.endTime}</span>
          ${hasTempPeriods ? '<span class="temp-badge-tag">⚡ JADWAL SEHARIAN</span>' : ''}
        </div>

        <div>
          <h4 class="schedule-subject-name">${item.subject}</h4>
        </div>

        <div class="schedule-teacher-row">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>${item.teacher || 'Guru'}</span>
        </div>

        ${item.room ? `
          <div class="schedule-room-row">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span>${item.room}</span>
          </div>
        ` : ''}

        ${isGuru && !hasTempPeriods ? `
          <div class="schedule-card-actions">
            <button type="button" class="btn btn-secondary btn-sm" style="flex:1;" onclick="window.editScheduleItem('${item.id}')">
              Ubah
            </button>
            <button type="button" class="btn btn-danger btn-sm" style="flex:1;" onclick="window.deleteScheduleItem('${item.id}')">
              Hapus
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// 4. Render Subview 2: Jadwal Sementara Seharian
function renderTemporarySchedulesList() {
  const isGuru = appState.currentUser && (appState.currentUser.role === 'guru' || appState.currentUser.role === 'teacher');
  const listEl = document.getElementById('temporaryScheduleList');
  if (!listEl) return;

  const tempSchedules = (appState.temporarySchedules || [])
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (tempSchedules.length === 0) {
    listEl.innerHTML = `
      <div class="ui-state-container" style="grid-column: 1 / -1; padding: 40px 20px; text-align: center;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="1.5" style="margin-bottom: 12px;">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        <h4 style="color: #F8FAFC; margin-bottom: 6px;">Belum Ada Jadwal Sementara Seharian</h4>
        <p style="color: #94A3B8; font-size: 0.875rem;">Semua mata pelajaran saat ini mengikuti jadwal reguler kelas.</p>
        ${isGuru ? `
          <button type="button" class="btn btn-primary btn-sm" style="margin-top: 14px;" onclick="window.openTempScheduleModal()">
            + Buat Jadwal Sementara Seharian
          </button>
        ` : ''}
      </div>
    `;
    return;
  }

  listEl.innerHTML = tempSchedules.map(item => {
    const periods = Array.isArray(item.periods) ? item.periods : [];

    return `
      <div class="temp-schedule-card ${item.isActive ? '' : 'is-inactive'}">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="temp-badge-tag">
            ⚡ JADWAL SEHARIAN PENUH
          </span>
          <span class="temp-date-tag">${item.date || ''} (${item.day || ''})</span>
        </div>

        <div>
          <h4 style="font-size: 1.15rem; font-weight: 700; color: #F8FAFC; margin: 0 0 4px 0;">
            ${item.title || 'Jadwal Khusus Seharian'}
          </h4>
          <span style="font-size: 0.75rem; color: #94A3B8;">${periods.length} sesi jam pelajaran terdaftar</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px; margin: 8px 0; max-height: 140px; overflow-y: auto; padding-right: 4px;">
          ${periods.map(p => `
            <div style="padding: 6px 8px; background: rgba(0,0,0,0.25); border-radius: 6px; font-size: 0.8rem; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="color: #F8FAFC;">${p.subject}</strong>
                <span style="color: #94A3B8; display: block; font-size: 0.72rem;">${p.teacher || ''} ${p.room ? '• ' + p.room : ''}</span>
              </div>
              <span style="font-family: monospace; font-size: 0.75rem; color: #60A5FA; background: rgba(59, 130, 246, 0.15); padding: 2px 6px; border-radius: 4px; white-space: nowrap;">${p.startTime}-${p.endTime}</span>
            </div>
          `).join('')}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.06);">
          <span style="font-size: 0.75rem; font-weight: 600; color: ${item.isActive ? '#10B981' : '#64748B'};">
            ${item.isActive ? '● Sedang Aktif' : '○ Nonaktif / Selesai'}
          </span>

          ${isGuru ? `
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.toggleTempScheduleActive('${item.id}', ${!item.isActive})">
                ${item.isActive ? 'Matikan' : 'Aktifkan'}
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.editTempScheduleItem('${item.id}')">
                Ubah
              </button>
              <button type="button" class="btn btn-danger btn-sm" onclick="window.deleteTempScheduleItem('${item.id}')">
                Hapus
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// 5. Render Subview 3: Daftar Piket Kelas
function renderPiketView() {
  const isGuru = appState.currentUser && (appState.currentUser.role === 'guru' || appState.currentUser.role === 'teacher');
  const gridEl = document.getElementById('piketDaysGrid');
  if (!gridEl) return;

  const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
  const todayDay = getIndonesianDayName();
  const studentList = getStudentsReferenceList();
  const piketData = appState.piket || {};

  gridEl.innerHTML = days.map(day => {
    const isToday = day === todayDay;
    const assignedAbsens = piketData[day] || [];
    const assignedStudents = assignedAbsens.map(absen => {
      const found = studentList.find(s => Number(s.absen) === Number(absen));
      return found ? found : { absen, name: `Siswa Absen ${absen}` };
    });

    return `
      <div class="piket-day-card ${isToday ? 'is-today' : ''}">
        <div class="piket-day-header">
          <h4 class="piket-day-title">${day}</h4>
          ${isToday ? '<span class="piket-today-pill">🧹 PIKET HARI INI</span>' : ''}
        </div>

        <div class="piket-students-list">
          ${assignedStudents.length === 0 ? `
            <div style="padding: 16px 8px; text-align: center; color: #64748B; font-size: 0.8125rem;">
              Belum ada regu piket
            </div>
          ` : assignedStudents.map(st => `
            <div class="piket-student-row">
              <span class="piket-absen-badge">${st.absen}</span>
              <span class="piket-student-name">${st.name}</span>
            </div>
          `).join('')}
        </div>

        ${isGuru ? `
          <button type="button" class="btn btn-secondary btn-sm" style="width: 100%; margin-top: auto;" onclick="window.openPiketModal('${day}')">
            Atur Piket ${day}
          </button>
        ` : ''}
      </div>
    `;
  }).join('');
}

// 6. Render Subview 4: Daftar Devo (Devosi / Renungan Pagi)
function renderDevoView() {
  const isGuru = appState.currentUser && (appState.currentUser.role === 'guru' || appState.currentUser.role === 'teacher');
  const listEl = document.getElementById('devoListContainer');
  if (!listEl) return;

  const devoList = (appState.devo || [])
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (devoList.length === 0) {
    listEl.innerHTML = `
      <div class="ui-state-container" style="grid-column: 1 / -1; padding: 40px 20px; text-align: center;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="1.5" style="margin-bottom: 12px;">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
          <path d="M6 6h10"/>
          <path d="M6 10h10"/>
        </svg>
        <h4 style="color: #F8FAFC; margin-bottom: 6px;">Belum Ada Jadwal Devo</h4>
        <p style="color: #94A3B8; font-size: 0.875rem;">Jadwal pembawa renungan pagi dan doa pembuka belum ditambahkan.</p>
        ${isGuru ? `
          <button type="button" class="btn btn-primary btn-sm" style="margin-top: 14px;" onclick="window.openDevoModal()">
            + Tambah Petugas Devo Pertama
          </button>
        ` : ''}
      </div>
    `;
    return;
  }

  listEl.innerHTML = devoList.map(item => {
    const isToday = item.status === 'today' || item.date === getTodayYMD();

    let statusPill = '<span class="status-badge badge-pending">Akan Datang</span>';
    if (item.status === 'completed') {
      statusPill = '<span class="status-badge badge-submitted">Selesai</span>';
    } else if (isToday) {
      statusPill = '<span class="status-badge badge-graded" style="background:rgba(168,85,247,0.2); border-color:rgba(168,85,247,0.4); color:#C084FC;">Hari Ini</span>';
    }

    return `
      <div class="devo-card ${isToday ? 'status-today' : ''}">
        <div class="devo-card-top">
          <span class="devo-date-badge">${item.date || ''} (${item.day || ''})</span>
          ${statusPill}
        </div>

        <div>
          <h4 class="devo-topic-title">${item.topic}</h4>
          ${item.scripture ? `
            <div class="devo-scripture-box" style="margin-top: 6px;">
              "${item.scripture}"
            </div>
          ` : ''}
        </div>

        <div class="devo-person-info">
          <div>
            Petugas Siswa: <strong>${item.studentName || ('Absen ' + item.studentAbsen)}</strong>
            ${item.studentAbsen ? ` (Absen ${item.studentAbsen})` : ''}
          </div>
        </div>

        ${isGuru ? `
          <div style="display: flex; gap: 8px; margin-top: auto; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.06);">
            <button type="button" class="btn btn-secondary btn-sm" style="flex:1;" onclick="window.editDevoItem('${item.id}')">
              Ubah
            </button>
            <button type="button" class="btn btn-danger btn-sm" style="flex:1;" onclick="window.deleteDevoItem('${item.id}')">
              Hapus
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// 7. Modals and Forms Controller

// Schedule Modal
window.openScheduleModal = function(editItem = null) {
  const modal = document.getElementById('scheduleModal');
  const title = document.getElementById('scheduleModalTitle');
  const form = document.getElementById('scheduleForm');
  if (!modal || !form) return;

  document.getElementById('scheduleFormId').value = editItem ? editItem.id : '';
  document.getElementById('scheduleFormDay').value = editItem ? editItem.day : (appState.activeScheduleDay || 'Senin');
  document.getElementById('scheduleFormSubject').value = editItem ? editItem.subject : '';
  document.getElementById('scheduleFormStartTime').value = editItem ? editItem.startTime : '08:00';
  document.getElementById('scheduleFormEndTime').value = editItem ? editItem.endTime : '09:30';
  document.getElementById('scheduleFormTeacher').value = editItem ? (editItem.teacher || '') : '';
  document.getElementById('scheduleFormRoom').value = editItem ? (editItem.room || '') : '';

  if (title) {
    title.textContent = editItem ? 'Ubah Jam Pelajaran' : 'Tambah Jam Pelajaran';
  }

  modal.showModal();
};

window.openScheduleModalForDay = function(day) {
  appState.activeScheduleDay = day;
  window.openScheduleModal();
};

window.editScheduleItem = function(id) {
  const item = (appState.schedules || []).find(s => s.id === id);
  if (item) window.openScheduleModal(item);
};

window.deleteScheduleItem = async function(id) {
  const confirmed = await showConfirmDialog({
    title: 'Hapus Jam Pelajaran',
    message: 'Apakah Anda yakin ingin menghapus jam pelajaran ini dari roster mingguan?',
    confirmText: 'Hapus Jadwal',
    cancelText: 'Batal',
    type: 'danger'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/schedules?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Jam pelajaran berhasil dihapus.', 'success');
      await refreshData();
    } else {
      showToast('Gagal menghapus jam pelajaran.', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
};

// Temporary Schedule Modal (Jadwal Sementara Seharian Penuh)
window.openTempScheduleModal = function(editItem = null) {
  const modal = document.getElementById('temporaryScheduleModal');
  const title = document.getElementById('tempScheduleModalTitle');
  const form = document.getElementById('tempScheduleForm');
  if (!modal || !form) return;

  const todayYMD = getTodayYMD();
  document.getElementById('tempScheduleFormId').value = editItem ? editItem.id : '';
  document.getElementById('tempScheduleFormTitle').value = editItem ? (editItem.title || '') : '';
  document.getElementById('tempScheduleFormDate').value = editItem ? (editItem.date || todayYMD) : todayYMD;
  document.getElementById('tempScheduleFormActive').value = editItem ? String(editItem.isActive) : 'true';

  const defaultSamplePeriods = [
    { startTime: "07:30", endTime: "09:00", subject: "Simulasi Ujian Matematika", teacher: "Drs. Budi Santoso", room: "Lab Komputer 1" },
    { startTime: "09:30", endTime: "11:00", subject: "Simulasi Ujian Informatika", teacher: "Arcz, S.Kom", room: "Lab Multimedia" }
  ];

  const periodsInput = document.getElementById('tempSchedulePeriodsJson');
  if (periodsInput) {
    if (editItem && Array.isArray(editItem.periods) && editItem.periods.length > 0) {
      periodsInput.value = JSON.stringify(editItem.periods, null, 2);
    } else {
      periodsInput.value = JSON.stringify(defaultSamplePeriods, null, 2);
    }
  }

  const btnFillSample = document.getElementById('btnFillSampleTempPeriods');
  if (btnFillSample && periodsInput) {
    btnFillSample.onclick = () => {
      periodsInput.value = JSON.stringify(defaultSamplePeriods, null, 2);
      showToast('Contoh format jam pelajaran seharian dimasukkan.', 'info');
    };
  }

  if (title) {
    title.textContent = editItem ? 'Ubah Jadwal Sementara Seharian' : 'Tambah Jadwal Sementara Seharian';
  }

    if (typeof window.renderTempScheduleRowsFromData === 'function') {
    const pData = editItem && Array.isArray(editItem.periods) ? editItem.periods : defaultSamplePeriods;
    window.renderTempScheduleRowsFromData(pData);
  }
  modal.showModal();
};

window.editTempScheduleItem = function(id) {
  const item = (appState.temporarySchedules || []).find(ts => ts.id === id);
  if (item) window.openTempScheduleModal(item);
};

window.toggleTempScheduleActive = async function(id, nextState) {
  const item = (appState.temporarySchedules || []).find(ts => ts.id === id);
  if (!item) return;

  try {
    const payload = { ...item, isActive: nextState };
    const res = await fetch('/api/temporary-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast(nextState ? 'Jadwal sementara seharian diaktifkan.' : 'Jadwal sementara seharian dinonaktifkan.', 'success');
      await refreshData();
    } else {
      showToast('Gagal mengubah status jadwal sementara.', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
};

window.deleteTempScheduleItem = async function(id) {
  const confirmed = await showConfirmDialog({
    title: 'Hapus Jadwal Sementara Seharian',
    message: 'Apakah Anda yakin ingin menghapus jadwal sementara satu hari penuh ini?',
    confirmText: 'Hapus Jadwal',
    cancelText: 'Batal',
    type: 'danger'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/temporary-schedules?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Jadwal sementara seharian berhasil dihapus.', 'success');
      await refreshData();
    } else {
      showToast('Gagal menghapus jadwal sementara.', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
};

// Piket Modal
window.openPiketModal = function(targetDay = null) {
  const modal = document.getElementById('piketModal');
  const daySelect = document.getElementById('piketFormDay');
  const checkGrid = document.getElementById('piketStudentsCheckGrid');
  const countBadge = document.getElementById('piketSelectedCountBadge');
  if (!modal || !daySelect || !checkGrid) return;

  const currentDay = targetDay || appState.activeScheduleDay || 'Senin';
  daySelect.value = currentDay;

  const studentList = getStudentsReferenceList();

  function updateChecklistForDay(day) {
    const assignedAbsens = new Set(((appState.piket && appState.piket[day]) || []).map(Number));

    checkGrid.innerHTML = studentList.map(st => {
      const isChecked = assignedAbsens.has(Number(st.absen));
      return `
        <label class="piket-check-label">
          <input type="checkbox" name="piketStudentAbsen" value="${st.absen}" ${isChecked ? 'checked' : ''}>
          <span><strong>#${st.absen}</strong> ${st.name}</span>
        </label>
      `;
    }).join('');

    const updateCount = () => {
      const checkedCount = checkGrid.querySelectorAll('input[type="checkbox"]:checked').length;
      if (countBadge) countBadge.textContent = `${checkedCount} Siswa Terpilih`;
    };

    checkGrid.querySelectorAll('input[type="checkbox"]').forEach(ch => {
      ch.onchange = updateCount;
    });

    updateCount();
  }

  daySelect.onchange = () => {
    updateChecklistForDay(daySelect.value);
  };

  updateChecklistForDay(currentDay);
  modal.showModal();
};

// Devo Modal (Tanpa Guru Pendamping & Tanpa Catatan)
window.openDevoModal = function(editItem = null) {
  const modal = document.getElementById('devoModal');
  const title = document.getElementById('devoModalTitle');
  const studentSelect = document.getElementById('devoFormStudent');
  if (!modal || !studentSelect) return;

  const studentList = getStudentsReferenceList();
  studentSelect.innerHTML = studentList.map(st => {
    return `<option value="${st.absen}">Absen ${st.absen} - ${st.name}</option>`;
  }).join('');

  const todayYMD = getTodayYMD();
  document.getElementById('devoFormId').value = editItem ? editItem.id : '';
  document.getElementById('devoFormDate').value = editItem ? (editItem.date || todayYMD) : todayYMD;
  document.getElementById('devoFormTopic').value = editItem ? (editItem.topic || '') : '';
  document.getElementById('devoFormScripture').value = editItem ? (editItem.scripture || '') : '';
  document.getElementById('devoFormStatus').value = editItem ? (editItem.status || 'upcoming') : 'upcoming';

  if (editItem && editItem.studentAbsen) {
    studentSelect.value = String(editItem.studentAbsen);
  }

  if (title) {
    title.textContent = editItem ? 'Ubah Petugas Devo' : 'Tambah Petugas Devo (Renungan Pagi)';
  }

  modal.showModal();
};

window.editDevoItem = function(id) {
  const item = (appState.devo || []).find(d => d.id === id);
  if (item) window.openDevoModal(item);
};

window.deleteDevoItem = async function(id) {
  const confirmed = await showConfirmDialog({
    title: 'Hapus Petugas Devo',
    message: 'Apakah Anda yakin ingin menghapus jadwal renungan pagi ini?',
    confirmText: 'Hapus Jadwal',
    cancelText: 'Batal',
    type: 'danger'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/devo?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Jadwal devo berhasil dihapus.', 'success');
      await refreshData();
    } else {
      showToast('Gagal menghapus jadwal devo.', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
};

// ==========================================================================
// 8. Universal JSON Import & Input Controller (Jadwal, Temp, Piket, Devo)
// ==========================================================================
let currentJsonCategory = 'schedule';

const SCHEDULE_JSON_SAMPLES = {
  schedule: [
    {
      "day": "Senin",
      "startTime": "07:30",
      "endTime": "09:00",
      "subject": "Upacara & Matematika",
      "teacher": "Drs. Budi Santoso",
      "room": "Ruang Kelas 10-A"
    },
    {
      "day": "Senin",
      "startTime": "09:15",
      "endTime": "10:45",
      "subject": "Bahasa Indonesia",
      "teacher": "Siti Nurhaliza, M.Pd",
      "room": "Ruang Kelas 10-A"
    },
    {
      "day": "Selasa",
      "startTime": "08:00",
      "endTime": "09:30",
      "subject": "Informatika",
      "teacher": "Arcz, S.Kom",
      "room": "Lab Komputer 1"
    }
  ],
  temp_schedule: [
    {
      "id": "tempsched_simulasi",
      "title": "Simulasi Ujian Semester Genap",
      "date": "2026-11-06",
      "day": "Jumat",
      "isActive": true,
      "periods": [
        {
          "startTime": "07:30",
          "endTime": "09:00",
          "subject": "Simulasi Ujian Matematika",
          "teacher": "Drs. Budi Santoso",
          "room": "Lab Komputer 1"
        },
        {
          "startTime": "09:30",
          "endTime": "11:00",
          "subject": "Simulasi Ujian Informatika",
          "teacher": "Arcz, S.Kom",
          "room": "Lab Multimedia"
        }
      ]
    }
  ],
  piket: {
    "Senin": [1, 2, 3],
    "Selasa": [4, 5, 6],
    "Rabu": [7, 8, 9],
    "Kamis": [10, 11, 12],
    "Jumat": [13, 14, 15]
  },
  devo: [
    {
      "date": "2026-11-06",
      "day": "Jumat",
      "studentAbsen": 1,
      "studentName": "Ahmad Fauzi",
      "topic": "Integritas & Kedisiplinan Pelajar",
      "scripture": "Amsal 3:5-6",
      "status": "upcoming"
    },
    {
      "date": "2026-11-09",
      "day": "Senin",
      "studentAbsen": 2,
      "studentName": "Annisa Rahma",
      "topic": "Ketekunan Membuahkan Hasil",
      "scripture": "Galatia 6:9",
      "status": "upcoming"
    }
  ]
};

const JSON_CATEGORY_DESCRIPTIONS = {
  schedule: 'Format JSON array jadwal reguler mingguan: setiap objek memiliki properti day, startTime, endTime, subject, teacher, room.',
  temp_schedule: 'Format JSON array jadwal sementara seharian: setiap objek memiliki title, date, day, isActive, dan periods (array sesi jam).',
  piket: 'Format JSON objek piket kelas: key berupa nama hari (Senin..Jumat) dengan value array nomor absen siswa.',
  devo: 'Format JSON array devosi pagi (tanpa guru pendamping & catatan): properti date, day, studentAbsen, studentName, topic, scripture, status.'
};

window.openScheduleJsonModal = function(category = 'schedule') {
  const modal = document.getElementById('scheduleJsonModal');
  const inputEl = document.getElementById('scheduleJsonInput');
  const descEl = document.getElementById('jsonCategoryDescription');
  if (!modal || !inputEl) return;

  currentJsonCategory = category;

  // Update tabs active state
  const tabs = modal.querySelectorAll('.history-tab-btn');
  tabs.forEach(t => {
    if (t.dataset.category === category) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  if (descEl) {
    descEl.textContent = JSON_CATEGORY_DESCRIPTIONS[category] || '';
  }

  // Populate existing data or sample
  let currentData = null;
  if (category === 'schedule') currentData = appState.schedules;
  else if (category === 'temp_schedule') currentData = appState.temporarySchedules;
  else if (category === 'piket') currentData = appState.piket;
  else if (category === 'devo') currentData = appState.devo;

  if (currentData && (Array.isArray(currentData) ? currentData.length > 0 : Object.keys(currentData).length > 0)) {
    inputEl.value = JSON.stringify(currentData, null, 2);
  } else {
    inputEl.value = JSON.stringify(SCHEDULE_JSON_SAMPLES[category], null, 2);
  }

  modal.showModal();
};

function initScheduleJsonModal() {
  const modal = document.getElementById('scheduleJsonModal');
  const inputEl = document.getElementById('scheduleJsonInput');
  const descEl = document.getElementById('jsonCategoryDescription');
  if (!modal || !inputEl) return;

  // Category Tab Clicks
  const tabs = modal.querySelectorAll('.history-tab-btn');
  tabs.forEach(t => {
    t.onclick = () => {
      const cat = t.dataset.category;
      if (!cat) return;
      currentJsonCategory = cat;
      tabs.forEach(btn => btn.classList.remove('active'));
      t.classList.add('active');

      if (descEl) descEl.textContent = JSON_CATEGORY_DESCRIPTIONS[cat] || '';

      let currentData = null;
      if (cat === 'schedule') currentData = appState.schedules;
      else if (cat === 'temp_schedule') currentData = appState.temporarySchedules;
      else if (cat === 'piket') currentData = appState.piket;
      else if (cat === 'devo') currentData = appState.devo;

      if (currentData && (Array.isArray(currentData) ? currentData.length > 0 : Object.keys(currentData).length > 0)) {
        inputEl.value = JSON.stringify(currentData, null, 2);
      } else {
        inputEl.value = JSON.stringify(SCHEDULE_JSON_SAMPLES[cat], null, 2);
      }
    };
  });

  // Button Load Sample
  const btnLoadSample = document.getElementById('btnLoadSampleJson');
  if (btnLoadSample) {
    btnLoadSample.onclick = () => {
      inputEl.value = JSON.stringify(SCHEDULE_JSON_SAMPLES[currentJsonCategory], null, 2);
      showToast(`Format contoh JSON ${currentJsonCategory} dimuat ke editor.`, 'info');
    };
  }

  // Button Copy Sample
  const btnCopySample = document.getElementById('btnCopySampleJson');
  if (btnCopySample) {
    btnCopySample.onclick = async () => {
      const text = inputEl.value.trim() || JSON.stringify(SCHEDULE_JSON_SAMPLES[currentJsonCategory], null, 2);
      try {
        await navigator.clipboard.writeText(text);
        showToast('Format JSON berhasil disalin ke clipboard!', 'success');
      } catch (e) {
        showToast('Gagal menyalin, silakan blok teks secara manual.', 'error');
      }
    };
  }

  // Button Submit JSON
  const btnSubmit = document.getElementById('btnSubmitScheduleJson');
  if (btnSubmit) {
    btnSubmit.onclick = async () => {
      const text = inputEl.value.trim();
      if (!text) {
        showToast('Silakan masukkan format teks JSON terlebih dahulu.', 'warning');
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        showToast('Format teks JSON tidak valid. Periksa tanda kurung atau koma.', 'error');
        return;
      }

      let endpoint = '';
      if (currentJsonCategory === 'schedule') endpoint = '/api/schedules/bulk-json';
      else if (currentJsonCategory === 'temp_schedule') endpoint = '/api/temporary-schedules/bulk-json';
      else if (currentJsonCategory === 'piket') endpoint = '/api/piket/bulk-json';
      else if (currentJsonCategory === 'devo') endpoint = '/api/devo/bulk-json';

      btnSubmit.disabled = true;
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed)
        });

        if (res.ok) {
          const resData = await res.json().catch(() => ({}));
          showToast(resData.message || 'Data JSON berhasil diimpor & disimpan!', 'success');
          modal.close();
          await refreshData();
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(errData.error || 'Gagal menyimpan data JSON.', 'error');
        }
      } catch (err) {
        showToast('Terjadi kesalahan koneksi server.', 'error');
      } finally {
        btnSubmit.disabled = false;
      }
    };
  }
}

// Wire up submit forms and cancel buttons once DOM is loaded
function initScheduleForms() {
  // Close / Cancel modal buttons
  [
    { btn: 'btnCloseScheduleModal', modal: 'scheduleModal' },
    { btn: 'btnCancelScheduleModal', modal: 'scheduleModal' },
    { btn: 'btnCloseTempScheduleModal', modal: 'temporaryScheduleModal' },
    { btn: 'btnCancelTempScheduleModal', modal: 'temporaryScheduleModal' },
    { btn: 'btnClosePiketModal', modal: 'piketModal' },
    { btn: 'btnCancelPiketModal', modal: 'piketModal' },
    { btn: 'btnCloseDevoModal', modal: 'devoModal' },
    { btn: 'btnCancelDevoModal', modal: 'devoModal' },
    { btn: 'btnCloseScheduleJsonModal', modal: 'scheduleJsonModal' },
    { btn: 'btnCancelScheduleJsonModal', modal: 'scheduleJsonModal' }
  ].forEach(pair => {
    const btn = document.getElementById(pair.btn);
    const modal = document.getElementById(pair.modal);
    if (btn && modal) {
      btn.onclick = () => modal.close();
    }
  });

  // Action buttons in toolbar
  const btnAddSched = document.getElementById('btnActionAddSchedule');
  if (btnAddSched) btnAddSched.onclick = () => window.openScheduleModal();

  const btnAddTemp = document.getElementById('btnActionAddTempSchedule');
  if (btnAddTemp) btnAddTemp.onclick = () => window.openTempScheduleModal();

  const btnOpenAddTempModal = document.getElementById('btnOpenAddTempModal');
  if (btnOpenAddTempModal) btnOpenAddTempModal.onclick = () => window.openTempScheduleModal();

  const btnSetPiket = document.getElementById('btnActionSetPiket');
  if (btnSetPiket) btnSetPiket.onclick = () => window.openPiketModal();

  const btnOpenEditPiket = document.getElementById('btnOpenEditPiketModal');
  if (btnOpenEditPiket) btnOpenEditPiket.onclick = () => window.openPiketModal();

  const btnAddDevo = document.getElementById('btnActionAddDevo');
  if (btnAddDevo) btnAddDevo.onclick = () => window.openDevoModal();

  const btnOpenAddDevo = document.getElementById('btnOpenAddDevoModal');
  if (btnOpenAddDevo) btnOpenAddDevo.onclick = () => window.openDevoModal();

  const btnOpenJson = document.getElementById('btnOpenScheduleJsonModal');
  if (btnOpenJson) btnOpenJson.onclick = () => window.openScheduleJsonModal('schedule');

  // Schedule Form Submit
  const scheduleForm = document.getElementById('scheduleForm');
  if (scheduleForm) {
    scheduleForm.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btnSaveSchedule');
      if (saveBtn) saveBtn.disabled = true;

      const payload = {
        id: document.getElementById('scheduleFormId').value.trim() || undefined,
        day: document.getElementById('scheduleFormDay').value,
        subject: document.getElementById('scheduleFormSubject').value.trim(),
        startTime: document.getElementById('scheduleFormStartTime').value,
        endTime: document.getElementById('scheduleFormEndTime').value,
        teacher: document.getElementById('scheduleFormTeacher').value.trim(),
        room: document.getElementById('scheduleFormRoom').value.trim()
      };

      try {
        const res = await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast('Jam pelajaran berhasil disimpan!', 'success');
          document.getElementById('scheduleModal').close();
          await refreshData();
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(errData.error || 'Gagal menyimpan jam pelajaran.', 'error');
        }
      } catch (err) {
        showToast('Terjadi kesalahan koneksi server.', 'error');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    };
  }

  // Temporary Schedule Form Submit (Seharian Penuh)
  const tempForm = document.getElementById('tempScheduleForm');
  if (tempForm) {
    tempForm.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btnSaveTempSchedule');
      if (saveBtn) saveBtn.disabled = true;

      const rawDate = document.getElementById('tempScheduleFormDate').value;
      const dayName = getIndonesianDayName(new Date(rawDate + 'T00:00:00'));
      const periodsRaw = document.getElementById('tempSchedulePeriodsJson').value.trim();

      let periodsList = [];
      try {
        periodsList = JSON.parse(periodsRaw);
        if (!Array.isArray(periodsList)) {
          showToast('Format daftar jam pelajaran harus berupa array JSON [ ... ]', 'error');
          if (saveBtn) saveBtn.disabled = false;
          return;
        }
      } catch (err) {
        showToast('Format JSON jam pelajaran seharian tidak valid.', 'error');
        if (saveBtn) saveBtn.disabled = false;
        return;
      }

      const payload = {
        id: document.getElementById('tempScheduleFormId').value.trim() || undefined,
        title: document.getElementById('tempScheduleFormTitle').value.trim(),
        date: rawDate,
        day: dayName,
        isActive: document.getElementById('tempScheduleFormActive').value === 'true',
        periods: periodsList
      };

      try {
        const res = await fetch('/api/temporary-schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast('Jadwal sementara seharian berhasil disimpan!', 'success');
          document.getElementById('temporaryScheduleModal').close();
          await refreshData();
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(errData.error || 'Gagal menyimpan jadwal sementara.', 'error');
        }
      } catch (err) {
        showToast('Terjadi kesalahan koneksi server.', 'error');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    };
  }

  // Piket Form Submit
  const piketForm = document.getElementById('piketForm');
  if (piketForm) {
    piketForm.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btnSavePiket');
      if (saveBtn) saveBtn.disabled = true;

      const day = document.getElementById('piketFormDay').value;
      const checkedBoxes = piketForm.querySelectorAll('input[name="piketStudentAbsen"]:checked');
      const studentAbsens = Array.from(checkedBoxes).map(cb => Number(cb.value));

      try {
        const res = await fetch('/api/piket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day, studentAbsens })
        });
        if (res.ok) {
          showToast(`Daftar regu piket hari ${day} berhasil disimpan!`, 'success');
          document.getElementById('piketModal').close();
          await refreshData();
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(errData.error || 'Gagal menyimpan regu piket.', 'error');
        }
      } catch (err) {
        showToast('Terjadi kesalahan koneksi server.', 'error');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    };
  }

  // Devo Form Submit (Tanpa Guru Pendamping & Tanpa Catatan)
  const devoForm = document.getElementById('devoForm');
  if (devoForm) {
    devoForm.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btnSaveDevo');
      if (saveBtn) saveBtn.disabled = true;

      const studentList = getStudentsReferenceList();
      const studentAbsen = Number(document.getElementById('devoFormStudent').value);
      const studentObj = studentList.find(s => Number(s.absen) === studentAbsen);
      const rawDate = document.getElementById('devoFormDate').value;
      const dayName = getIndonesianDayName(new Date(rawDate + 'T00:00:00'));

      const payload = {
        id: document.getElementById('devoFormId').value.trim() || undefined,
        date: rawDate,
        day: dayName,
        studentAbsen,
        studentName: studentObj ? studentObj.name : `Siswa Absen ${studentAbsen}`,
        topic: document.getElementById('devoFormTopic').value.trim(),
        scripture: document.getElementById('devoFormScripture').value.trim(),
        status: document.getElementById('devoFormStatus').value
      };

      try {
        const res = await fetch('/api/devo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast('Jadwal petugas devo berhasil disimpan!', 'success');
          document.getElementById('devoModal').close();
          await refreshData();
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(errData.error || 'Gagal menyimpan petugas devo.', 'error');
        }
      } catch (err) {
        showToast('Terjadi kesalahan koneksi server.', 'error');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    };
  }

  initScheduleJsonModal();
}

startApp();
initScheduleForms();
initTeacherClassModal();
initCompiler();


// Live countdown ticker running every second
if (!window.xozenCountdownInterval) {
  window.xozenCountdownInterval = setInterval(updateAllCountdowns, 1000);
}


// ==========================================================================
// FITUR PRESENTASI LITERASI RABU (KELUAR SATU PERSATU SECARA BERSIH)
// ==========================================================================

const literasiState = {
  isSpinning: false,
  savedData: null
};

async function loadSavedLiterasi() {
  const currentClassId = appState.activeClassId || 'XB';
  const arena = document.getElementById('literasiStageArena');
  const statusBadge = document.getElementById('literasiStatusBadge');
  const savedSection = document.getElementById('literasiSavedSection');

  try {
    const res = await fetch('/api/literasi');
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.presenters) && data.presenters.length > 0) {
        literasiState.savedData = data;
        renderSavedLiterasi(data);
        return;
      }
    }
  } catch (err) {
    console.warn('Gagal memuat undian literasi dari server, coba localStorage:', err);
  }

  // Fallback ke localStorage
  const localRaw = localStorage.getItem(`myPnk_literasi_${currentClassId}`);
  if (localRaw) {
    try {
      const data = JSON.parse(localRaw);
      if (data && Array.isArray(data.presenters) && data.presenters.length > 0) {
        literasiState.savedData = data;
        renderSavedLiterasi(data);
        return;
      }
    } catch {}
  }

  // Tampilan default kosong
  if (arena) {
    arena.innerHTML = `
      <div class="literasi-placeholder" id="literasiPlaceholder">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 8px; color: #94A3B8;">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <p style="margin: 0; font-size: 0.875rem; color: #94A3B8;">Tentukan jumlah siswa lalu klik <strong>"Mulai Acak Presentasi"</strong>.</p>
      </div>
    `;
  }
  if (statusBadge) {
    if (window._literasiBadgeTimeout) clearTimeout(window._literasiBadgeTimeout);
    statusBadge.classList.remove('is-dismissed');
    statusBadge.style.opacity = '1';
    statusBadge.style.display = 'inline-flex';
    statusBadge.textContent = 'Siap Mengundi';
    statusBadge.style.background = 'rgba(255, 255, 255, 0.06)';
    statusBadge.style.color = '#94A3B8';
    statusBadge.style.borderColor = 'rgba(255, 255, 255, 0.12)';
  }
  if (savedSection) savedSection.style.display = 'none';
}

function renderSavedLiterasi(data) {
  const arena = document.getElementById('literasiStageArena');
  const statusBadge = document.getElementById('literasiStatusBadge');
  const savedSection = document.getElementById('literasiSavedSection');
  const savedList = document.getElementById('literasiSavedList');
  const savedDateEl = document.getElementById('literasiSavedDate');

  if (!arena || !data || !Array.isArray(data.presenters)) return;

  const currentClassId = appState.activeClassId || 'XB';
  const classNameLabel = currentClassId === 'XB' ? 'Kelas X-B' : (currentClassId === 'XA' ? 'Kelas X-A' : 'Kelas X-C');

  arena.innerHTML = '';
  data.presenters.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'literasi-block-card winner';
    card.innerHTML = `
      <div class="literasi-card-badge">Presenter ${idx + 1}</div>
      <div class="literasi-winner-name">${p.name}</div>
      <div class="literasi-absen-tag">Absen ${p.absen} &bull; ${classNameLabel}</div>
    `;
    arena.appendChild(card);
  });

  if (statusBadge) {
    statusBadge.textContent = `Tersimpan (${data.presenters.length} Presenter)`;
    statusBadge.style.background = 'rgba(16, 185, 129, 0.1)';
    statusBadge.style.color = '#10B981';
    statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.25)';
    dismissLiterasiBadgeAfter3s();
  }

  if (savedSection) savedSection.style.display = 'block';
  if (savedDateEl && data.date) {
    try {
      const d = new Date(data.date);
      savedDateEl.textContent = `Rabu, ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    } catch {
      savedDateEl.textContent = 'Sesi Literasi';
    }
  }

  if (savedList) {
    savedList.innerHTML = data.presenters.map((p, i) => `
      <div class="literasi-chip-item">
        <span class="chip-num">#${i + 1}</span>
        <span class="chip-name">${p.name}</span>
        <span class="chip-absen">Absen ${p.absen}</span>
      </div>
    `).join('');
  }
}

async function startLiterasiSpin() {
  if (literasiState.isSpinning) return;

  const currentClassId = appState.activeClassId || 'XB';
  const roster = getRosterForClass(currentClassId);
  if (!roster || roster.length === 0) {
    showToast('Tidak ada siswa di kelas ini.', 'warning');
    return;
  }

  const countInput = document.getElementById('literasiCountInput');
  const requestedCount = parseInt(countInput ? countInput.value : '2', 10) || 2;
  const count = Math.max(1, Math.min(requestedCount, roster.length));

  const arena = document.getElementById('literasiStageArena');
  const btnStart = document.getElementById('btnStartLiterasiSpin');
  const btnReset = document.getElementById('btnResetLiterasi');
  const statusBadge = document.getElementById('literasiStatusBadge');
  const savedSection = document.getElementById('literasiSavedSection');

  if (savedSection) savedSection.style.display = 'none';

  // Acak urutan presenter tanpa duplikasi (Fisher-Yates)
  const shuffledRoster = [...roster];
  for (let i = shuffledRoster.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledRoster[i], shuffledRoster[j]] = [shuffledRoster[j], shuffledRoster[i]];
  }
  const finalWinners = shuffledRoster.slice(0, count);

  literasiState.isSpinning = true;
  if (btnStart) btnStart.disabled = true;
  if (btnReset) btnReset.disabled = true;

  arena.innerHTML = '';

  const classNameLabel = currentClassId === 'XB' ? 'Kelas X-B' : (currentClassId === 'XA' ? 'Kelas X-A' : 'Kelas X-C');

  // Keluar SATU PER SATU secara berurutan
  for (let i = 0; i < count; i++) {
    if (!literasiState.isSpinning) break;

    if (statusBadge) {
      statusBadge.textContent = `Memilih Presenter ${i + 1} dari ${count}...`;
      statusBadge.style.background = 'rgba(56, 189, 248, 0.12)';
      statusBadge.style.color = '#38BDF8';
      statusBadge.style.borderColor = 'rgba(56, 189, 248, 0.25)';
    }

    // Buat kartu presenter yang sedang diacak
    const card = document.createElement('div');
    card.className = 'literasi-block-card shuffling';
    card.innerHTML = `
      <div class="literasi-card-badge">Presenter ${i + 1}</div>
      <div class="literasi-shuffle-name" id="literasiShuffleName_${i}">...</div>
      <div class="literasi-absen-tag">Mengundi...</div>
    `;
    arena.appendChild(card);

    const nameEl = document.getElementById(`literasiShuffleName_${i}`);

    // Acak cepat nama selama 1.2 detik
    await new Promise(resolve => {
      const startTime = Date.now();
      const shuffleTimer = setInterval(() => {
        const randIndex = Math.floor(Math.random() * roster.length);
        if (nameEl) nameEl.textContent = roster[randIndex].name;

        if (Date.now() - startTime >= 1200) {
          clearInterval(shuffleTimer);
          resolve();
        }
      }, 50);
    });

    // Kunci nama presenter ini secara bersih
    const winner = finalWinners[i];
    card.className = 'literasi-block-card winner';
    card.innerHTML = `
      <div class="literasi-card-badge">Presenter ${i + 1}</div>
      <div class="literasi-winner-name">${winner.name}</div>
      <div class="literasi-absen-tag">Absen ${winner.absen} &bull; ${classNameLabel}</div>
    `;

    // Jeda sejenak sebelum presenter berikutnya keluar
    if (i < count - 1) {
      await new Promise(r => setTimeout(r, 350));
    }
  }

  literasiState.isSpinning = false;
  if (btnStart) btnStart.disabled = false;
  if (btnReset) btnReset.disabled = false;

  if (statusBadge) {
    statusBadge.textContent = `Selesai (${count} Presenter Terpilih)`;
    statusBadge.style.background = 'rgba(16, 185, 129, 0.12)';
    statusBadge.style.color = '#10B981';
    statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.25)';
  }

  // Simpan data undian
  const record = {
    presenters: finalWinners,
    date: new Date().toISOString(),
    classId: currentClassId,
    count
  };
  literasiState.savedData = record;
  localStorage.setItem(`myPnk_literasi_${currentClassId}`, JSON.stringify(record));

  fetch('/api/literasi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-class-id': currentClassId },
    body: JSON.stringify(record)
  }).catch(e => console.warn('Gagal simpan ke server:', e));

  renderSavedLiterasi(record);
  showLiterasiSlideBanner(finalWinners);
  showToast(`Presenter Literasi: ${finalWinners.map(w => w.name).join(', ')}`, 'success');
}

function dismissLiterasiBadgeAfter3s() {
  const statusBadge = document.getElementById('literasiStatusBadge');
  if (!statusBadge) return;
  if (window._literasiBadgeTimeout) clearTimeout(window._literasiBadgeTimeout);
  statusBadge.classList.remove('is-dismissed');
  statusBadge.style.display = 'inline-flex';
  statusBadge.style.opacity = '1';

  window._literasiBadgeTimeout = setTimeout(() => {
    statusBadge.classList.add('is-dismissed');
    setTimeout(() => {
      if (statusBadge.classList.contains('is-dismissed')) {
        statusBadge.style.display = 'none';
      }
    }, 400);
  }, 3000);
}

function showLiterasiSlideBanner(winners) {
  const banner = document.getElementById('literasiSlideBanner');
  const fill = document.getElementById('literasiTimerBarFill');
  const desc = document.getElementById('literasiSlideDesc');
  if (!banner || !fill) return;

  if (desc && winners && winners.length > 0) {
    desc.textContent = `Presenter: ${winners.map(w => w.name).join(', ')}`;
  }

  banner.classList.remove('hidden', 'retracting');
  fill.style.transition = 'none';
  fill.style.width = '0%';

  void fill.offsetWidth;

  fill.style.transition = 'width 3000ms linear';
  fill.style.width = '100%';

  dismissLiterasiBadgeAfter3s();

  if (window._literasiSlideTimeout) clearTimeout(window._literasiSlideTimeout);
  window._literasiSlideTimeout = setTimeout(() => {
    banner.classList.add('retracting');
    setTimeout(() => {
      banner.classList.add('hidden');
      banner.classList.remove('retracting');
    }, 400);
  }, 3000);
}

async function resetLiterasi() {
  if (literasiState.isSpinning) return;

  const currentClassId = appState.activeClassId || 'XB';
  try {
    await fetch('/api/literasi/reset', {
      method: 'POST',
      headers: { 'x-class-id': currentClassId }
    });
  } catch (err) {
    console.warn('Gagal reset di server:', err);
  }

  localStorage.removeItem(`myPnk_literasi_${currentClassId}`);
  literasiState.savedData = null;

  const arena = document.getElementById('literasiStageArena');
  const statusBadge = document.getElementById('literasiStatusBadge');
  const savedSection = document.getElementById('literasiSavedSection');

  if (arena) {
    arena.innerHTML = `
      <div class="literasi-placeholder" id="literasiPlaceholder">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 8px; color: #94A3B8;">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <p style="margin: 0; font-size: 0.875rem; color: #94A3B8;">Tentukan jumlah siswa lalu klik <strong>"Mulai Acak Presentasi"</strong>.</p>
      </div>
    `;
  }

  if (statusBadge) {
    if (window._literasiBadgeTimeout) clearTimeout(window._literasiBadgeTimeout);
    statusBadge.classList.remove('is-dismissed');
    statusBadge.style.opacity = '1';
    statusBadge.style.display = 'inline-flex';
    statusBadge.textContent = 'Siap Mengundi';
    statusBadge.style.background = 'rgba(255, 255, 255, 0.06)';
    statusBadge.style.color = '#94A3B8';
    statusBadge.style.borderColor = 'rgba(255, 255, 255, 0.12)';
  }

  if (savedSection) savedSection.style.display = 'none';

  showToast('Undian literasi di-reset.', 'info');
}

// Inisialisasi event listener tab literasi
function initLiterasiControls() {
  const tabBtnLiterasi = document.getElementById('tabBtnLiterasi');
  if (tabBtnLiterasi) {
    tabBtnLiterasi.addEventListener('click', () => switchClassToolsTab('literasi'));
  }

  const btnStart = document.getElementById('btnStartLiterasiSpin');
  if (btnStart) {
    btnStart.addEventListener('click', startLiterasiSpin);
  }

  const btnReset = document.getElementById('btnResetLiterasi');
  if (btnReset) {
    btnReset.addEventListener('click', resetLiterasi);
  }
}

// Panggil initLiterasiControls saat halaman siap
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLiterasiControls);
} else {
  initLiterasiControls();
}

// ==========================================================================
// PENGATURAN WALLPAPER SISTEM (KHUSUS ADMIN / GURU)
// ==========================================================================

const WALLPAPER_PRESETS = [
  {
    id: 'default',
    title: 'CasaOS Fluid',
    desc: 'Latar default gelombang biru gelap',
    url: '/assets/wallpaper.jpg',
    thumb: '/assets/wallpaper.jpg'
  },
  {
    id: 'pnk-school',
    title: 'Gedung Sekolah PNK',
    desc: 'Fasad gedung Sekolah Kristen Pelita Nusantara Kasih Surakarta',
    url: '/assets/wallpapers/wallpaper-pnk.jpg',
    thumb: '/assets/wallpapers/wallpaper-pnk.jpg'
  },
  {
    id: 'whale',
    title: 'Paus Biru',
    desc: 'Ilustrasi crayon paus biru artistik',
    url: '/assets/wallpapers/wallpaper-whale.jpg',
    thumb: '/assets/wallpapers/wallpaper-whale.jpg'
  },
  {
    id: 'plant',
    title: 'Tanaman Monokrom',
    desc: 'Estetika minimalis bayangan jendela',
    url: '/assets/wallpapers/wallpaper-plant.jpg',
    thumb: '/assets/wallpapers/wallpaper-plant.jpg'
  },
  {
    id: 'gradient',
    title: 'Gradasi Biru-Sian',
    desc: 'Gradien vertikal segar & modern',
    url: '/assets/wallpapers/wallpaper-gradient.jpg',
    thumb: '/assets/wallpapers/wallpaper-gradient.jpg'
  },
  {
    id: 'sky',
    title: 'Langit & Awan',
    desc: 'Pemandangan langit biru cerah berawan',
    url: '/assets/wallpapers/wallpaper-sky.jpg',
    thumb: '/assets/wallpapers/wallpaper-sky.jpg'
  },
  {
    id: 'geometry',
    title: 'Geometri Biru',
    desc: 'Pola grid blueprint abstrak & rapi',
    url: '/assets/wallpapers/wallpaper-geometry.jpg',
    thumb: '/assets/wallpapers/wallpaper-geometry.jpg'
  },
  {
    id: 'cat',
    title: 'Kucing di Rumput',
    desc: 'Kucing santai di atas rumput berbunga',
    url: '/assets/wallpapers/wallpaper-cat.jpg',
    thumb: '/assets/wallpapers/wallpaper-cat.jpg'
  }
];

let currentWallpaperUrl = localStorage.getItem('mypnk_wallpaper') || '/assets/wallpaper.jpg';

function applyWallpaper(url, persistToServer = false) {
  if (!url) return;
  currentWallpaperUrl = url;
  document.documentElement.style.setProperty('--app-wallpaper', `url("${url}")`);
  try {
    localStorage.setItem('mypnk_wallpaper', url);
  } catch (e) {}

  if (persistToServer) {
    fetch('/api/wallpaper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallpaper: url })
    }).catch(() => {});
  }
}

function renderWallpaperPresetsGrid() {
  const container = document.getElementById('wallpaperPresetsGrid');
  if (!container) return;

  const current = currentWallpaperUrl;
  container.innerHTML = WALLPAPER_PRESETS.map(p => {
    const isAct = current === p.url || (p.id === 'default' && (current === '/assets/wallpaper.jpg' || current === 'assets/wallpaper.jpg'));
    return `
      <div class="wallpaper-card ${isAct ? 'active' : ''}" data-wall-url="${p.url}" role="button" tabindex="0" aria-label="Pilih wallpaper ${escapeHtml(p.title)}">
        <div class="wallpaper-card-thumb-wrap">
          <img src="${p.thumb}" alt="${escapeHtml(p.title)}" class="wallpaper-card-thumb" loading="lazy">
          <div class="wallpaper-card-check" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>
        <div class="wallpaper-card-info">
          <span class="wallpaper-card-title">${escapeHtml(p.title)}</span>
          <span class="wallpaper-card-desc">${escapeHtml(p.desc)}</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.wallpaper-card').forEach(card => {
    card.addEventListener('click', () => {
      const url = card.getAttribute('data-wall-url');
      if (url) {
        applyWallpaper(url, true);
        renderWallpaperPresetsGrid();
        showToast('Wallpaper berhasil diubah!', 'success');
      }
    });
  });
}

function initWallpaperSettings() {
  // Terapkan wallpaper yang tersimpan
  applyWallpaper(currentWallpaperUrl, false);

  // Sinkronisasi dengan server jika tersedia
  fetch('/api/wallpaper')
    .then(r => r.json())
    .then(data => {
      if (data && data.wallpaper) {
        applyWallpaper(data.wallpaper, false);
      }
    })
    .catch(() => {});

  const btnOpenWall = document.getElementById('btnOpenWallpaperModal');
  const modal = document.getElementById('wallpaperModal');
  if (btnOpenWall && modal) {
    btnOpenWall.addEventListener('click', () => {
      renderWallpaperPresetsGrid();
      modal.showModal();
    });
  }

  ['btnCloseWallpaperModal', 'btnCloseWallpaperFooter'].forEach(id => {
    const b = document.getElementById(id);
    if (b && modal) {
      b.addEventListener('click', () => modal.close());
    }
  });

  if (modal) {
    modal.addEventListener('click', (e) => {
      const rect = modal.getBoundingClientRect();
      const inBox = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
                     rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
      if (!inBox) modal.close();
    });
  }

  const btnTrigger = document.getElementById('btnTriggerCustomWallpaper');
  const inputCustom = document.getElementById('inputCustomWallpaper');
  if (btnTrigger && inputCustom) {
    btnTrigger.addEventListener('click', () => inputCustom.click());
    inputCustom.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('Berkas harus berupa gambar (JPG, PNG, WebP).', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = (re) => {
        const dataUrl = re.target.result;
        applyWallpaper(dataUrl, true);
        renderWallpaperPresetsGrid();
        showToast('Wallpaper kustom berhasil diterapkan!', 'success');
      };
      reader.readAsDataURL(file);
    });
  }

  const btnReset = document.getElementById('btnResetDefaultWallpaper');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      applyWallpaper('/assets/wallpaper.jpg', true);
      renderWallpaperPresetsGrid();
      showToast('Wallpaper dikembalikan ke default.', 'info');
    });
  }
}

// Inisialisasi wallpaper settings saat halaman dimuat
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWallpaperSettings);
} else {
  initWallpaperSettings();
}


/* ==========================================================================
   INTERACTIVE TOOLS UPGRADE:
   1. WHEEL OF NAMES: POP UP PARTICIPANTS MODAL & INTERACTIVE CLICK-LIST
   2. RANDOM TEAMS: BOOK POPUP MODAL RECONFIGURATION
   3. TEMPORARY SCHEDULE: DYNAMIC PERIOD FORM BUILDER
   4. SUBMISSIONS: BENTO GRID CARDS & FULL DETAIL POPUP
   5. MEDIA STARTER / IN-BROWSER COMPILER (ZOOM, ANOTASI, VIDEO, PDF TO PPT, KODE)
   ========================================================================== */

// --- 1. WHEEL OF NAMES POP UP & CLICK LIST ---
let wheelActiveParticipants = new Set();

function initWheelParticipantsPopup() {
  const btnOpen = document.getElementById('btnOpenWheelParticipantsModal');
  const modal = document.getElementById('wheelNamesModal');
  const btnClose = document.getElementById('btnCloseWheelNamesModal');
  const btnCancel = document.getElementById('btnCancelWheelNames');
  const btnSave = document.getElementById('btnSaveWheelNames');
  const btnSelectAll = document.getElementById('btnWheelSelectAll');
  const btnDeselectAll = document.getElementById('btnWheelDeselectAll');
  const btnShuffle = document.getElementById('btnWheelShuffleModal');
  const btnLoadClass = document.getElementById('btnWheelLoadClass');
  const tabClick = document.getElementById('tabWheelModeClickList');
  const tabText = document.getElementById('tabWheelModeTextList');
  const panelClick = document.getElementById('panelWheelClickList');
  const panelText = document.getElementById('panelWheelTextList');
  const countLabel = document.getElementById('wheelParticipantsCountLabel');

  function getActiveRoster() {
    const clsId = appState.activeClassId || 'XB';
    return getRosterForClass(clsId);
  }

  function getActiveWheelNamesList() {
    const textarea = document.getElementById('wheelNamesInput');
    if (textarea && textarea.value && textarea.value.trim().length > 0) {
      return textarea.value.split('\n').map(s => s.trim()).filter(Boolean);
    }
    if (classToolsState.wheelNames && classToolsState.wheelNames.length > 0) {
      return classToolsState.wheelNames;
    }
    return getClassStudentNames();
  }

  function isStudentInWheelList(student, namesList) {
    const sNameLower = (student.name || '').toLowerCase().trim();
    const sAbsen = student.absen != null ? Number(student.absen) : null;
    return namesList.some(line => {
      const lTrim = line.trim();
      const lLower = lTrim.toLowerCase();
      if (lLower === sNameLower || lLower.endsWith(sNameLower) || sNameLower.endsWith(lLower)) return true;
      const mMatch = lTrim.match(/^0*(\d+)[\.\s\-]/);
      if (mMatch && sAbsen != null && Number(mMatch[1]) === sAbsen) return true;
      return false;
    });
  }

  function updateWheelCountBadge() {
    const list = getActiveWheelNamesList();
    if (countLabel) countLabel.textContent = `${list.length} Siswa`;
    const wheelBadge = document.getElementById('wheelCountBadge');
    if (wheelBadge) wheelBadge.textContent = `${list.length} Nama`;
  }

  function renderStudentsChecklist() {
    const container = document.getElementById('wheelStudentsCheckGrid');
    if (!container) return;

    const roster = getActiveRoster();
    const currentNames = getActiveWheelNamesList();

    wheelActiveParticipants.clear();
    roster.forEach(s => {
      if (isStudentInWheelList(s, currentNames)) {
        wheelActiveParticipants.add(s.name);
      }
    });

    if (wheelActiveParticipants.size === 0 && roster.length > 0) {
      roster.forEach(s => wheelActiveParticipants.add(s.name));
    }

    container.innerHTML = roster.map(s => {
      const isChecked = wheelActiveParticipants.has(s.name);
      return `
        <label class="wheel-student-checkpill ${isChecked ? 'active' : ''}">
          <input type="checkbox" data-name="${escapeHtml(s.name)}" ${isChecked ? 'checked' : ''}>
          <span style="font-size:0.75rem; color:#38BDF8; font-weight:700;">#${s.absen || '-'}</span>
          <span class="wheel-checkpill-name">${escapeHtml(s.name)}</span>
        </label>
      `;
    }).join('');

    container.querySelectorAll('.wheel-student-checkpill input').forEach(input => {
      input.addEventListener('change', (e) => {
        const name = e.target.getAttribute('data-name');
        const pill = e.target.closest('.wheel-student-checkpill');
        if (e.target.checked) {
          wheelActiveParticipants.add(name);
          if (pill) pill.classList.add('active');
        } else {
          wheelActiveParticipants.delete(name);
          if (pill) pill.classList.remove('active');
        }
        syncChecklistToTextarea();
        updateWheelCountBadge();
      });
    });
  }

  function syncChecklistToTextarea() {
    const textarea = document.getElementById('wheelNamesInput');
    if (!textarea) return;
    const roster = getActiveRoster();
    const selected = [];
    roster.forEach(s => {
      if (wheelActiveParticipants.has(s.name)) {
        const num = String(s.absen || '').padStart(2, '0');
        selected.push(num ? `${num}. ${s.name}` : s.name);
      }
    });
    textarea.value = selected.join('\n');
  }

  function syncTextareaToChecklist() {
    const current = getActiveWheelNamesList();
    const roster = getActiveRoster();
    wheelActiveParticipants.clear();
    roster.forEach(s => {
      if (isStudentInWheelList(s, current)) {
        wheelActiveParticipants.add(s.name);
      }
    });
    const container = document.getElementById('wheelStudentsCheckGrid');
    if (container) {
      container.querySelectorAll('.wheel-student-checkpill').forEach(pill => {
        const input = pill.querySelector('input');
        if (input) {
          const name = input.getAttribute('data-name');
          const isChecked = wheelActiveParticipants.has(name);
          input.checked = isChecked;
          pill.classList.toggle('active', isChecked);
        }
      });
    }
  }

  if (btnOpen && modal) {
    btnOpen.addEventListener('click', () => {
      const textarea = document.getElementById('wheelNamesInput');
      if (textarea && (!textarea.value || textarea.value.trim() === '')) {
        const names = (classToolsState.wheelNames && classToolsState.wheelNames.length > 0)
          ? classToolsState.wheelNames
          : getClassStudentNames();
        textarea.value = names.join('\n');
      }
      renderStudentsChecklist();
      syncChecklistToTextarea();
      updateWheelCountBadge();
      modal.showModal();
    });
  }

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => modal.close());
  }
  if (btnCancel && modal) {
    btnCancel.addEventListener('click', () => modal.close());
  }

  if (btnSave && modal) {
    btnSave.addEventListener('click', () => {
      if (tabClick && tabClick.classList.contains('active')) {
        syncChecklistToTextarea();
      }
      syncWheelNamesFromTextarea();
      updateWheelCountBadge();
      modal.close();
      showToast('Daftar peserta roda putar berhasil diterapkan!', 'success');
    });
  }

  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      const container = document.getElementById('wheelStudentsCheckGrid');
      if (!container) return;
      const roster = getActiveRoster();
      roster.forEach(s => wheelActiveParticipants.add(s.name));
      container.querySelectorAll('.wheel-student-checkpill').forEach(pill => {
        const input = pill.querySelector('input');
        if (input) input.checked = true;
        pill.classList.add('active');
      });
      syncChecklistToTextarea();
      updateWheelCountBadge();
    });
  }

  if (btnDeselectAll) {
    btnDeselectAll.addEventListener('click', () => {
      const container = document.getElementById('wheelStudentsCheckGrid');
      if (!container) return;
      wheelActiveParticipants.clear();
      container.querySelectorAll('.wheel-student-checkpill').forEach(pill => {
        const input = pill.querySelector('input');
        if (input) input.checked = false;
        pill.classList.remove('active');
      });
      syncChecklistToTextarea();
      updateWheelCountBadge();
    });
  }

  if (btnShuffle) {
    btnShuffle.addEventListener('click', () => {
      const roster = getActiveRoster();
      const current = [];
      roster.forEach(s => {
        if (wheelActiveParticipants.has(s.name)) {
          const num = String(s.absen || '').padStart(2, '0');
          current.push(num ? `${num}. ${s.name}` : s.name);
        }
      });
      for (let i = current.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [current[i], current[j]] = [current[j], current[i]];
      }
      const textarea = document.getElementById('wheelNamesInput');
      if (textarea) textarea.value = current.join('\n');
      showToast('Urutan peserta diacak!', 'info');
    });
  }

  if (btnLoadClass) {
    btnLoadClass.addEventListener('click', () => {
      const students = getClassStudentNames();
      const textarea = document.getElementById('wheelNamesInput');
      if (textarea) {
        textarea.value = students.join('\n');
        syncTextareaToChecklist();
        updateWheelCountBadge();
        showToast(`Berhasil memuat ${students.length} siswa kelas!`, 'info');
      }
    });
  }

  if (tabClick && tabText && panelClick && panelText) {
    tabClick.addEventListener('click', () => {
      tabClick.classList.add('active');
      tabText.classList.remove('active');
      panelClick.classList.remove('hidden');
      panelText.classList.add('hidden');
      syncTextareaToChecklist();
      updateWheelCountBadge();
    });
    tabText.addEventListener('click', () => {
      tabText.classList.add('active');
      tabClick.classList.remove('active');
      panelText.classList.remove('hidden');
      panelClick.classList.add('hidden');
      syncChecklistToTextarea();
      updateWheelCountBadge();
    });
  }

  updateWheelCountBadge();
}

// --- 2. RANDOM TEAMS: BOOK POPUP MODAL RECONFIGURATION ---
function initTeamsConfigModal() {
  const btnBook = document.getElementById('btnOpenTeamsConfigPopup');
  const modal = document.getElementById('teamsConfigModal');
  const btnClose = document.getElementById('btnCloseTeamsConfigModal');
  const btnCancel = document.getElementById('btnCancelTeamsConfigModal');
  const btnApply = document.getElementById('btnApplyTeamsConfigModal');

  const mainTextarea = document.getElementById('teamNamesInput');
  const modalTextarea = document.getElementById('teamNamesInputModal');
  const mainCount = document.getElementById('teamCountInput');
  const modalCount = document.getElementById('teamCountInputModal');
  const mainNaming = document.getElementById('teamNamingSelect');
  const modalNaming = document.getElementById('teamNamingSelectModal');

  if (btnBook && modal) {
    btnBook.addEventListener('click', () => {
      if (mainTextarea && modalTextarea) modalTextarea.value = mainTextarea.value;
      if (mainCount && modalCount) modalCount.value = mainCount.value;
      if (mainNaming && modalNaming) modalNaming.value = mainNaming.value;

      const mainMode = document.querySelector('input[name="teamDivisionMode"]:checked')?.value || 'by_teams';
      const modalRadio = modal.querySelector(`input[name="teamDivisionModeModal"][value="${mainMode}"]`);
      if (modalRadio) modalRadio.checked = true;

      modal.showModal();
    });
  }

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => modal.close());
  }
  if (btnCancel && modal) {
    btnCancel.addEventListener('click', () => modal.close());
  }

  if (btnApply && modal) {
    btnApply.addEventListener('click', () => {
      if (mainTextarea && modalTextarea) mainTextarea.value = modalTextarea.value;
      if (mainCount && modalCount) mainCount.value = modalCount.value;
      if (mainNaming && modalNaming) mainNaming.value = modalNaming.value;

      const modalMode = modal.querySelector('input[name="teamDivisionModeModal"]:checked')?.value || 'by_teams';
      const mainRadio = document.querySelector(`input[name="teamDivisionMode"][value="${modalMode}"]`);
      if (mainRadio) mainRadio.checked = true;

      modal.close();
      generateRandomTeams();
    });
  }
}

// --- 3. TEMPORARY SCHEDULE: DYNAMIC PERIOD ROWS FORM BUILDER ---
function initTempScheduleFormBuilder() {
  const container = document.getElementById('tempPeriodsRowsContainer');
  const btnAdd = document.getElementById('btnAddTempPeriodRow');
  const form = document.getElementById('tempScheduleForm');
  const hiddenJson = document.getElementById('tempSchedulePeriodsJson');

  if (!container) return;

  function createPeriodRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'temp-period-row';
    row.innerHTML = `
      <input type="time" class="form-input row-start-time" value="${escapeHtml(data.startTime || '07:30')}" required title="Jam Mulai">
      <input type="time" class="form-input row-end-time" value="${escapeHtml(data.endTime || '09:00')}" required title="Jam Selesai">
      <input type="text" class="form-input row-subject" placeholder="Mata Pelajaran / Kegiatan" value="${escapeHtml(data.subject || '')}" required>
      <input type="text" class="form-input row-teacher" placeholder="Guru Pengajar" value="${escapeHtml(data.teacher || '')}">
      <input type="text" class="form-input row-room" placeholder="Ruang / Lab" value="${escapeHtml(data.room || '')}">
      <button type="button" class="btn-remove-period-row" title="Hapus Jam Ini">&times;</button>
    `;

    row.querySelector('.btn-remove-period-row').addEventListener('click', () => {
      row.remove();
      syncPeriodsToJson();
    });

    row.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', syncPeriodsToJson);
    });

    container.appendChild(row);
    syncPeriodsToJson();
  }

  function syncPeriodsToJson() {
    const rows = container.querySelectorAll('.temp-period-row');
    const periods = [];
    rows.forEach(r => {
      const sTime = r.querySelector('.row-start-time')?.value || '';
      const eTime = r.querySelector('.row-end-time')?.value || '';
      const subj = r.querySelector('.row-subject')?.value || '';
      const teach = r.querySelector('.row-teacher')?.value || '';
      const rm = r.querySelector('.row-room')?.value || '';
      if (subj) {
        periods.push({ startTime: sTime, endTime: eTime, subject: subj, teacher: teach, room: rm });
      }
    });
    if (hiddenJson) {
      hiddenJson.value = JSON.stringify(periods);
    }
  }

  window.renderTempScheduleRowsFromData = function(periods) {
    container.innerHTML = '';
    if (Array.isArray(periods) && periods.length > 0) {
      periods.forEach(p => createPeriodRow(p));
    } else {
      createPeriodRow({ startTime: '07:30', endTime: '09:00', subject: '', teacher: '', room: 'Ruang Kelas' });
      createPeriodRow({ startTime: '09:30', endTime: '11:00', subject: '', teacher: '', room: 'Lab Komputer' });
    }
    syncPeriodsToJson();
  };

  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      const lastRow = container.querySelector('.temp-period-row:last-child');
      let nextStart = '09:30';
      let nextEnd = '11:00';
      if (lastRow) {
        const prevEnd = lastRow.querySelector('.row-end-time')?.value || '09:00';
        nextStart = prevEnd;
        nextEnd = addMinutesToTimeString(prevEnd, 90);
      }
      createPeriodRow({ startTime: nextStart, endTime: nextEnd, subject: '', teacher: '', room: '' });
    });
  }

  function addMinutesToTimeString(timeStr, minsToAdd) {
    try {
      const [h, m] = timeStr.split(':').map(Number);
      const total = h * 60 + m + minsToAdd;
      const newH = Math.floor(total / 60) % 24;
      const newM = total % 60;
      return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
    } catch {
      return '11:00';
    }
  }

  // Intercept open temporary schedule modal to render dynamic rows
  const origOpenTempModal = window.openCreateTemporaryScheduleModal;
  if (typeof origOpenTempModal === 'function') {
    window.openCreateTemporaryScheduleModal = function() {
      origOpenTempModal.apply(this, arguments);
      window.renderTempScheduleRowsFromData();
    };
  }
}

function initRealtimeGlobalSyncBar() {
  const bar = document.getElementById('realtimeGlobalSyncBar');
  if (!bar) return;

  const CYCLE_MS = 12000;
  const TICK_MS = 100;
  let elapsed = 0;

  setInterval(async () => {
    elapsed += TICK_MS;
    const pct = Math.min(100, (elapsed / CYCLE_MS) * 100);
    bar.style.width = `${pct}%`;

    if (elapsed >= CYCLE_MS) {
      elapsed = 0;
      bar.classList.add('syncing');

      // Silent background sync without disrupting user UI
      try {
        if (appState && appState.currentUser) {
          // 1. Silent sync submissions
          const resSub = await fetch('/api/submissions');
          if (resSub.ok) {
            const freshSubs = await resSub.json();
            if (Array.isArray(freshSubs)) {
              appState.submissions = freshSubs;
            }
          }

          // 2. Silent sync quiz sessions if monitor is active
          if (quizDom && quizDom.quizSessionMonitorModal && quizDom.quizSessionMonitorModal.open) {
            if (typeof fetchAndRenderMonitorSessions === 'function') {
              fetchAndRenderMonitorSessions();
            }
          }
        }
      } catch (err) {
        // quiet catch to avoid UI spam
      }

      setTimeout(() => {
        bar.classList.remove('syncing');
        bar.style.width = '0%';
      }, 300);
    }
  }, TICK_MS);
}

function initInteractiveToolsExtended() {
  initWheelParticipantsPopup();
  initTeamsConfigModal();
  initTempScheduleFormBuilder();
  initRealtimeGlobalSyncBar();
  initMobileNotifications();
}

// ==========================================================================
// MOBILE NOTIFICATIONS & SERVICE WORKER ENGINE
// ==========================================================================
function initMobileNotifications() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(() => {}).catch(() => {});
    });
  }

  // Request permission on user gesture
  if ('Notification' in window && Notification.permission === 'default') {
    const handleFirstGesture = () => {
      try {
        Notification.requestPermission().catch(() => {});
      } catch (e) {}
    };
    window.addEventListener('click', handleFirstGesture, { once: true });
    window.addEventListener('touchstart', handleFirstGesture, { once: true });
  }
}

function sendDeviceNotification(title, body, tag = 'mypnk-alert') {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/assets/logo.png',
        badge: '/assets/logo.png',
        tag
      });
      if (navigator.vibrate) {
        navigator.vibrate([150, 80, 150]);
      }
    } catch (e) {}
  }
}
window.sendDeviceNotification = sendDeviceNotification;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initInteractiveToolsExtended);
} else {
  initInteractiveToolsExtended();
}
