# Graph Report - !Web  (2026-11-12)

## Corpus Check
- 49 files · ~74,823 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 1, .exe 1, .log 1)

## Summary
- 308 nodes · 695 edges · 20 communities (15 shown, 5 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 53 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Frontend UI State & DOM Controls
- Backend HTTP Server & Local API
- Assignment Storage, Submissions & History
- showToast
- NPM Package Dependencies
- Spin Wheel, Randomizer & Literasi
- Quiz Maker & Import Pipeline
- refreshAllDiagnostics
- Quiz Runner & Anti-Cheat Guards
- Sidebar Navigation & Class Selector
- Auth Gateway & 3-Step Login Wizard
- Anti-Slop UI & Quality Audit Report #001
- App Initialization & IndexedDB Boot
- Live Quiz Session Monitor
- Student Avatar Cropper
- Remedial Quiz Publishing
- Anti-Slop UI & Quality Audit Report #002 (Revisi CBT Login Kelas XB)
- renderMakerQuestions
- AGENTS.md
- GEMINI.md

## God Nodes (most connected - your core abstractions)
1. `showToast()` - 53 edges
2. `escapeHtml()` - 24 edges
3. `refreshData()` - 23 edges
4. `renderAssignmentsList()` - 18 edges
5. `switchWorkspaceView()` - 17 edges
6. `renderQuizzesList()` - 17 edges
7. `handleApi()` - 17 edges
8. `openSubmissionsReviewModal()` - 16 edges
9. `renderCustomizeSubmissions()` - 16 edges
10. `openSubmitTaskModal()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Assignments Explorer Toolbar & View` --conceptually_related_to--> `renderAssignmentsList()`  [INFERRED]
  index.html → app.js
- `Assignments Explorer Toolbar & View` --conceptually_related_to--> `openGroupGradingModal()`  [INFERRED]
  index.html → app.js
- `Quizzes & Exam View` --conceptually_related_to--> `renderQuizzesList()`  [INFERRED]
  index.html → app.js
- `Quizzes & Exam View` --conceptually_related_to--> `startQuizRunner()`  [INFERRED]
  index.html → app.js
- `Schedule, Piket & Literasi View` --conceptually_related_to--> `startLiterasiSpin()`  [INFERRED]
  index.html → app.js

## Import Cycles
- None detected.

## Communities (20 total, 5 thin omitted)

### Community 0 - "Frontend UI State & DOM Controls"
Cohesion: 0.03
Nodes (55): appSidebar, appState, avatarCropState, btnClearWheelHistory, btnCloseClassTools, btnCopyTeams, btnDownloadTeams, btnGenerateTeams (+47 more)

### Community 1 - "Backend HTTP Server & Local API"
Cohesion: 0.08
Nodes (31): Local School Drive & Auto-Save Concept, classContext, CLASSES, collectBody(), DATA_DIR, __dirname, ensureTeacherAccount(), __filename (+23 more)

### Community 2 - "Assignment Storage, Submissions & History"
Cohesion: 0.20
Nodes (27): customizeAddAssignmentQuick(), dbDelete(), dbPut(), downloadSubmissionFile(), escapeHtml(), evaluateDeadline(), fetchAndRenderQuizHistory(), formatBytes() (+19 more)

### Community 3 - "showToast"
Cohesion: 0.11
Nodes (29): applyWallpaper(), changeTeacherPassword(), chooseLocalDriveFolder(), copyTeamsToClipboard(), createStudentAccount(), customizeAddStudent(), downloadQuizFormat(), downloadTeamsTxtFile() (+21 more)

### Community 4 - "NPM Package Dependencies"
Cohesion: 0.11
Nodes (21): author, dependencies, archiver@^8.0.0, pino@^10.4.0, qrcode@^1.5.4, ssh2@^1.17.0, @whiskeysockets/baileys@^7.0.0-rc14, description (+13 more)

### Community 5 - "Spin Wheel, Randomizer & Literasi"
Cohesion: 0.12
Nodes (20): celebrateWheelWinner(), drawWheel(), getClassStudentNames(), getRosterForClass(), initLiterasiControls(), loadSavedLiterasi(), openClassToolsModal(), openTaskHistoryModal() (+12 more)

### Community 6 - "Quiz Maker & Import Pipeline"
Cohesion: 0.12
Nodes (35): closeQuizMakerModal(), closeRemedialModal(), createDefaultQuestion(), formatIndonesianDate(), getEffectiveStudentQuizScore(), getIndonesianDayName(), getStudentsReferenceList(), getTodayYMD() (+27 more)

### Community 7 - "refreshAllDiagnostics"
Cohesion: 0.29
Nodes (7): createMagicBentoEngine(), fetchPublicIp(), initOrUpdateMagicBento(), refreshAllDiagnostics(), updateNetworkMonitor(), updateServerStatusMonitor(), Diagnostics Dashboard View

### Community 8 - "Quiz Runner & Anti-Cheat Guards"
Cohesion: 0.24
Nodes (12): getCurrentRunnerAnswers(), handleExamBeforeUnload(), handleFullscreenChange(), handleVisibilityChange(), handleWindowBlur(), renderRunnerQuestions(), reportFullscreenViolation(), reportTabExitViolation() (+4 more)

### Community 9 - "Sidebar Navigation & Class Selector"
Cohesion: 0.33
Nodes (7): closeMobileDrawer(), initTeacherClassModal(), openMobileDrawer(), restoreSidebarActiveView(), setSidebarActiveButton(), showTeacherClassSelector(), toggleMobileDrawer()

### Community 10 - "Auth Gateway & 3-Step Login Wizard"
Cohesion: 0.24
Nodes (9): collapseGatewayToButton(), expandGatewayToForm(), logoutUser(), setupTeacherLoginTrigger(), setWizardPaneVisibility(), setWizardStep(), triggerTeacherUnlock(), updateGatewayClassHelperText() (+1 more)

### Community 11 - "Anti-Slop UI & Quality Audit Report #001"
Cohesion: 0.50
Nodes (3): Anti-Slop UI & Quality Audit Report #001, Ringkasan Evaluasi, Temuan Audit (Findings List)

### Community 12 - "App Initialization & IndexedDB Boot"
Cohesion: 0.22
Nodes (9): dbGetAll(), initSchoolDB(), initStudentsRoster(), loadSavedSession(), startApp(), transitionGatewayToDashboard(), updateTasksSidebarSubmenu(), updateUserRoleUI() (+1 more)

### Community 13 - "Live Quiz Session Monitor"
Cohesion: 0.67
Nodes (3): fetchAndRenderMonitorSessions(), openSessionMonitorModal(), renderMonitorGrid()

### Community 16 - "Anti-Slop UI & Quality Audit Report #002 (Revisi CBT Login Kelas XB)"
Cohesion: 0.50
Nodes (3): Anti-Slop UI & Quality Audit Report #002 (Revisi CBT Login Kelas XB), Ringkasan Evaluasi, Temuan Audit (Findings List)

## Knowledge Gaps
- **3 isolated node(s):** `Local School Drive & Auto-Save Concept`, `Main App Shell & Sidebar Navigation`, `Diagnostics Dashboard View`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 110 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `showToast()` connect `showToast` to `Frontend UI State & DOM Controls`, `Assignment Storage, Submissions & History`, `Spin Wheel, Randomizer & Literasi`, `Quiz Maker & Import Pipeline`, `refreshAllDiagnostics`, `Quiz Runner & Anti-Cheat Guards`, `Auth Gateway & 3-Step Login Wizard`, `App Initialization & IndexedDB Boot`, `Live Quiz Session Monitor`, `renderMakerQuestions`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `Local School Drive & Auto-Save Concept`, `Main App Shell & Sidebar Navigation`, `Diagnostics Dashboard View` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend UI State & DOM Controls` be split into smaller, more focused modules?**
  _Cohesion score 0.029850746268656716 - nodes in this community are weakly interconnected._
- **Why does `initCompiler()` connect `showToast` to `Frontend UI State & DOM Controls`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Should `Backend HTTP Server & Local API` be split into smaller, more focused modules?**
  _Cohesion score 0.07926829268292683 - nodes in this community are weakly interconnected._
- **Why does `setupTeacherLoginTrigger()` connect `Auth Gateway & 3-Step Login Wizard` to `Frontend UI State & DOM Controls`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Should `showToast` be split into smaller, more focused modules?**
  _Cohesion score 0.11330049261083744 - nodes in this community are weakly interconnected._