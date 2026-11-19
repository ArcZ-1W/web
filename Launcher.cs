using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Text;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using System.Reflection;
using System.Runtime.InteropServices;

[assembly: AssemblyTitle("MyPNK Cloud Server")]
[assembly: AssemblyDescription("Sistem Cloud & Alat Kelas Mandiri - Pelita Nusantara Kasih")]
[assembly: AssemblyCompany("Sekolah Kristen Pelita Nusantara Kasih Surakarta")]
[assembly: AssemblyProduct("MyPNK Cloud")]
[assembly: AssemblyCopyright("Copyright (C) 2026")]
[assembly: AssemblyTrademark("Pelita Nusantara Kasih")]
[assembly: ComVisible(false)]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace MyPnkLauncher
{
    public class MainForm : Form
    {
        private static Process serverProcess = null;
        private static int serverPort = 3000;
        private static bool autoOpenBrowser = true;
        private static readonly string appDir = AppDomain.CurrentDomain.BaseDirectory;
        private static string nodeExecutable = null;

        private Label lblStatusPill;
        private Label lblServerLink;
        private RichTextBox txtLog;
        private Button btnOpenBrowser;
        private Button btnRestart;
        private Button btnShutdownAll;
        private Button btnConfig;
        private NotifyIcon trayIcon;

        public MainForm()
        {
            InitializeComponent();
            LoadConfig();
            nodeExecutable = FindNodeExecutable();

            this.Shown += (s, e) => {
                AppendLog("[SYSTEM] Memulai MyPNK Cloud Launcher...");
                if (string.IsNullOrEmpty(nodeExecutable))
                {
                    AppendLog("[ERROR] Node.js (node.exe) tidak ditemukan di komputer.");
                    AppendLog("[INFO] Unduh Node.js dari https://nodejs.org/");
                    UpdateStatus(false, "Node.js Hilang");
                    return;
                }

                AppendLog("[INFO] Node.js: " + nodeExecutable);
                StartServerWithTakeControl();

                if (autoOpenBrowser)
                {
                    ThreadPool.QueueUserWorkItem(_ => {
                        Thread.Sleep(1100);
                        OpenBrowser();
                    });
                }
            };

            this.FormClosing += (s, e) => {
                CleanExitServer();
                if (trayIcon != null)
                {
                    trayIcon.Visible = false;
                    trayIcon.Dispose();
                }
            };
        }

        private void InitializeComponent()
        {
            this.Text = "MyPNK Cloud - Server Panel";
            // Dimensi lebih ringkas, soft, dan proporsional (560 x 395)
            this.Size = new Size(560, 395);
            this.MinimumSize = new Size(520, 370);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(13, 19, 36); // Soft deep navy
            this.ForeColor = Color.FromArgb(241, 245, 249);
            this.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            this.ShowInTaskbar = true;

            // Load App Icon
            string iconPath = Path.Combine(appDir, "assets", "logo.ico");
            if (!File.Exists(iconPath))
            {
                iconPath = Path.Combine(Directory.GetParent(appDir).FullName, "assets", "logo.ico");
            }
            if (File.Exists(iconPath))
            {
                try { this.Icon = new Icon(iconPath); } catch { }
            }

            // Top Header: Soft Glass Card Styling
            Panel pnlHeader = new Panel();
            pnlHeader.Dock = DockStyle.Top;
            pnlHeader.Height = 64;
            pnlHeader.BackColor = Color.FromArgb(18, 27, 50); // Softer slate navy
            pnlHeader.Padding = new Padding(14, 8, 14, 8);

            Label lblTitle = new Label();
            lblTitle.Text = "MyPNK Cloud Server";
            lblTitle.Font = new Font("Segoe UI", 12.5F, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(56, 189, 248); // Soft cyan
            lblTitle.AutoSize = true;
            lblTitle.Location = new Point(14, 8);

            Label lblSubtitle = new Label();
            lblSubtitle.Text = "SMA Kristen Pelita Nusantara Kasih Surakarta";
            lblSubtitle.Font = new Font("Segoe UI", 8F, FontStyle.Regular);
            lblSubtitle.ForeColor = Color.FromArgb(148, 163, 184); // Soft muted text
            lblSubtitle.AutoSize = true;
            lblSubtitle.Location = new Point(16, 34);

            lblStatusPill = new Label();
            lblStatusPill.Text = " ● MEMULAI ";
            lblStatusPill.Font = new Font("Segoe UI", 8F, FontStyle.Bold);
            lblStatusPill.ForeColor = Color.White;
            lblStatusPill.BackColor = Color.FromArgb(71, 85, 105);
            lblStatusPill.AutoSize = true;
            lblStatusPill.Location = new Point(370, 10);
            lblStatusPill.Padding = new Padding(8, 3, 8, 3);

            lblServerLink = new Label();
            lblServerLink.Text = "http://localhost:" + serverPort;
            lblServerLink.Font = new Font("Segoe UI", 8.25F, FontStyle.Regular);
            lblServerLink.ForeColor = Color.FromArgb(96, 165, 250);
            lblServerLink.AutoSize = true;
            lblServerLink.Cursor = Cursors.Hand;
            lblServerLink.Location = new Point(370, 36);
            lblServerLink.Click += (s, e) => OpenBrowser();

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblSubtitle);
            pnlHeader.Controls.Add(lblStatusPill);
            pnlHeader.Controls.Add(lblServerLink);
            this.Controls.Add(pnlHeader);

            // Action Buttons: Compact & Soft Pill-style Bar
            Panel pnlButtons = new Panel();
            pnlButtons.Dock = DockStyle.Top;
            pnlButtons.Height = 40;
            pnlButtons.BackColor = Color.FromArgb(15, 22, 42);
            pnlButtons.Padding = new Padding(10, 5, 10, 5);

            btnOpenBrowser = CreateSoftButton("🌐 Buka Web", Color.FromArgb(37, 99, 235), Color.White);
            btnOpenBrowser.Location = new Point(12, 6);
            btnOpenBrowser.Size = new Size(115, 28);
            btnOpenBrowser.Click += (s, e) => OpenBrowser();

            btnRestart = CreateSoftButton("🔄 Restart", Color.FromArgb(14, 116, 144), Color.White);
            btnRestart.Location = new Point(133, 6);
            btnRestart.Size = new Size(95, 28);
            btnRestart.Click += (s, e) => RestartServer();

            btnConfig = CreateSoftButton("⚙️ Config", Color.FromArgb(51, 65, 85), Color.White);
            btnConfig.Location = new Point(234, 6);
            btnConfig.Size = new Size(90, 28);
            btnConfig.Click += (s, e) => OpenConfigFile();

            btnShutdownAll = CreateSoftButton("🛑 SHUTDOWN ALL", Color.FromArgb(225, 29, 72), Color.White);
            btnShutdownAll.Location = new Point(330, 6);
            btnShutdownAll.Size = new Size(185, 28);
            btnShutdownAll.Font = new Font("Segoe UI", 8F, FontStyle.Bold);
            btnShutdownAll.Click += (s, e) => ShutdownAll();

            pnlButtons.Controls.Add(btnOpenBrowser);
            pnlButtons.Controls.Add(btnRestart);
            pnlButtons.Controls.Add(btnConfig);
            pnlButtons.Controls.Add(btnShutdownAll);
            this.Controls.Add(pnlButtons);

            // Log Console: Rounded & Soft Output
            Panel pnlLogWrap = new Panel();
            pnlLogWrap.Dock = DockStyle.Fill;
            pnlLogWrap.Padding = new Padding(14, 10, 14, 12);
            pnlLogWrap.BackColor = Color.FromArgb(13, 19, 36);

            txtLog = new RichTextBox();
            txtLog.Dock = DockStyle.Fill;
            txtLog.BackColor = Color.FromArgb(15, 22, 41);
            txtLog.ForeColor = Color.FromArgb(203, 213, 225);
            txtLog.Font = new Font("Consolas", 8.5F, FontStyle.Regular);
            txtLog.BorderStyle = BorderStyle.None;
            txtLog.ReadOnly = true;
            txtLog.WordWrap = true;

            pnlLogWrap.Controls.Add(txtLog);
            this.Controls.Add(pnlLogWrap);

            // System Tray Setup
            ContextMenuStrip trayMenu = new ContextMenuStrip();
            trayMenu.Items.Add("Buka Web di Browser", null, (s, e) => OpenBrowser());
            trayMenu.Items.Add("Tampilkan Panel Kontrol", null, (s, e) => {
                this.Show();
                this.WindowState = FormWindowState.Normal;
                this.BringToFront();
            });
            trayMenu.Items.Add("Restart Server", null, (s, e) => RestartServer());
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("SHUTDOWN ALL (Matikan Total)", null, (s, e) => ShutdownAll());

            trayIcon = new NotifyIcon();
            trayIcon.Text = "MyPNK Cloud Server";
            if (this.Icon != null) trayIcon.Icon = this.Icon;
            else trayIcon.Icon = SystemIcons.Application;
            trayIcon.ContextMenuStrip = trayMenu;
            trayIcon.Visible = true;
            trayIcon.DoubleClick += (s, e) => {
                this.Show();
                this.WindowState = FormWindowState.Normal;
                this.BringToFront();
            };
        }

        private Button CreateSoftButton(string text, Color bg, Color fg)
        {
            Button btn = new Button();
            btn.Text = text;
            btn.BackColor = bg;
            btn.ForeColor = fg;
            btn.FlatStyle = FlatStyle.Flat;
            btn.FlatAppearance.BorderSize = 0;
            btn.Font = new Font("Segoe UI", 8.25F, FontStyle.Bold);
            btn.Cursor = Cursors.Hand;
            return btn;
        }

        private void AppendLog(string message)
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<string>(AppendLog), message);
                return;
            }

            if (txtLog == null || txtLog.IsDisposed) return;

            Color logColor = Color.FromArgb(203, 213, 225);
            if (message.StartsWith("[ERROR]")) logColor = Color.FromArgb(251, 113, 133); // Soft rose
            else if (message.StartsWith("[TAKE CONTROL]")) logColor = Color.FromArgb(253, 224, 71); // Soft yellow
            else if (message.StartsWith("[OK]")) logColor = Color.FromArgb(52, 211, 153); // Soft emerald
            else if (message.StartsWith("[SHUTDOWN]")) logColor = Color.FromArgb(244, 63, 94); // Soft crimson
            else if (message.StartsWith("[SERVER]")) logColor = Color.FromArgb(56, 189, 248); // Soft cyan

            txtLog.SelectionStart = txtLog.TextLength;
            txtLog.SelectionLength = 0;
            txtLog.SelectionColor = logColor;
            txtLog.AppendText(DateTime.Now.ToString("HH:mm:ss") + " " + message + Environment.NewLine);
            txtLog.ScrollToCaret();
        }

        private void UpdateStatus(bool online, string badgeText)
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<bool, string>(UpdateStatus), online, badgeText);
                return;
            }

            if (lblStatusPill == null) return;
            lblStatusPill.Text = online ? (" ● " + badgeText.ToUpper() + " ") : (" ○ " + badgeText.ToUpper() + " ");
            lblStatusPill.BackColor = online ? Color.FromArgb(16, 185, 129) : Color.FromArgb(225, 29, 72);
        }

        // -------------------------------------------------------------
        // PORT TAKEOVER & SERVER CONTROLLER
        // -------------------------------------------------------------
        private void StartServerWithTakeControl()
        {
            try
            {
                // Take Control: bebaskan port jika sedang digunakan proses lain
                TakeControlOfPort(serverPort);

                string serverScript = Path.Combine(appDir, "server.js");
                if (!File.Exists(serverScript))
                {
                    serverScript = Path.Combine(Directory.GetParent(appDir).FullName, "server.js");
                }

                if (!File.Exists(serverScript))
                {
                    AppendLog("[ERROR] server.js tidak ditemukan.");
                    UpdateStatus(false, "File Hilang");
                    return;
                }

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodeExecutable;
                psi.Arguments = "\"" + serverScript + "\"";
                psi.WorkingDirectory = appDir;
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.CreateNoWindow = true;
                psi.EnvironmentVariables["PORT"] = serverPort.ToString();

                serverProcess = new Process();
                serverProcess.StartInfo = psi;

                serverProcess.OutputDataReceived += (s, e) => {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        AppendLog("[SERVER] " + e.Data);
                    }
                };

                serverProcess.ErrorDataReceived += (s, e) => {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        AppendLog("[INFO] " + e.Data);
                    }
                };

                serverProcess.Start();
                serverProcess.BeginOutputReadLine();
                serverProcess.BeginErrorReadLine();

                UpdateStatus(true, "Online : " + serverPort);
                AppendLog("[OK] Server aktif pada: http://localhost:" + serverPort);
            }
            catch (Exception ex)
            {
                AppendLog("[ERROR] Gagal menjalankan server: " + ex.Message);
                UpdateStatus(false, "Gagal Start");
            }
        }

        private void TakeControlOfPort(int port)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("netstat", "-ano -p tcp");
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = true;
                psi.CreateNoWindow = true;
                Process p = Process.Start(psi);
                string output = p.StandardOutput.ReadToEnd();
                p.WaitForExit(1500);

                string[] lines = output.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string line in lines)
                {
                    if (line.Contains(":" + port) && line.Contains("LISTENING"))
                    {
                        string[] tokens = line.Trim().Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                        if (tokens.Length > 0)
                        {
                            string pidStr = tokens[tokens.Length - 1];
                            int pid;
                            if (int.TryParse(pidStr, out pid) && pid > 0 && pid != Process.GetCurrentProcess().Id)
                            {
                                AppendLog("[TAKE CONTROL] Port " + port + " dipakai PID " + pid + ". Mengambil alih...");
                                try
                                {
                                    Process procToKill = Process.GetProcessById(pid);
                                    procToKill.Kill();
                                    procToKill.WaitForExit(800);
                                    AppendLog("[TAKE CONTROL] PID " + pid + " dilepas. Port " + port + " kini bersih.");
                                }
                                catch (Exception kEx)
                                {
                                    AppendLog("[INFO] Status PID " + pid + ": " + kEx.Message);
                                }
                            }
                        }
                    }
                }
            }
            catch { }
        }

        private void RestartServer()
        {
            AppendLog("[SYSTEM] Merestart server...");
            CleanExitServer();
            Thread.Sleep(700);
            StartServerWithTakeControl();
        }

        private void ShutdownAll()
        {
            DialogResult dr = MessageBox.Show(
                "Apakah Anda yakin ingin mematikan SEMUA server dan membebaskan port 3000?",
                "Konfirmasi Shutdown All",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (dr == DialogResult.Yes)
            {
                AppendLog("[SHUTDOWN] Mematikan seluruh proses server...");
                CleanExitServer();
                TakeControlOfPort(serverPort);

                try
                {
                    Process[] procs = Process.GetProcessesByName("node");
                    foreach (Process np in procs)
                    {
                        try { np.Kill(); } catch { }
                    }
                }
                catch { }

                UpdateStatus(false, "DIMATIKAN");
                AppendLog("[SHUTDOWN] Semua server dan port " + serverPort + " telah dibebaskan sepenuhnya.");
                MessageBox.Show(
                    "Semua server MyPNK Cloud telah dimatikan total.\nPort " + serverPort + " telah bersih.",
                    "Shutdown Selesai",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
        }

        private void OpenBrowser()
        {
            try
            {
                string url = "http://localhost:" + serverPort;
                AppendLog("[BROWSER] Membuka URL: " + url);
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                AppendLog("[ERROR] Gagal membuka browser: " + ex.Message);
            }
        }

        private void OpenConfigFile()
        {
            try
            {
                string configPath = Path.Combine(appDir, "config.json");
                if (!File.Exists(configPath))
                {
                    configPath = Path.Combine(Directory.GetParent(appDir).FullName, "config.json");
                }
                if (File.Exists(configPath))
                {
                    Process.Start("notepad.exe", "\"" + configPath + "\"");
                }
            }
            catch { }
        }

        private void CleanExitServer()
        {
            try
            {
                if (serverProcess != null && !serverProcess.HasExited)
                {
                    serverProcess.Kill();
                    serverProcess.WaitForExit(800);
                    serverProcess = null;
                }
            }
            catch { }
        }

        private static string FindNodeExecutable()
        {
            string[] testPaths = new string[]
            {
                "node.exe",
                Path.Combine(appDir, "node.exe"),
                @"D:\nodejs\node.exe",
                @"C:\Program Files\nodejs\node.exe",
                @"C:\Program Files (x86)\nodejs\node.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"npm\node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\node\node.exe")
            };

            foreach (string p in testPaths)
            {
                if (File.Exists(p)) return p;
            }

            string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
            string[] dirs = pathEnv.Split(Path.PathSeparator);
            foreach (string d in dirs)
            {
                try
                {
                    string cand = Path.Combine(d.Trim(), "node.exe");
                    if (File.Exists(cand)) return cand;
                }
                catch { }
            }

            return "node";
        }

        private static void LoadConfig()
        {
            try
            {
                string configPath = Path.Combine(appDir, "config.json");
                if (!File.Exists(configPath))
                {
                    configPath = Path.Combine(Directory.GetParent(appDir).FullName, "config.json");
                }

                if (File.Exists(configPath))
                {
                    string text = File.ReadAllText(configPath);
                    int pIdx = text.IndexOf("\"port\":");
                    if (pIdx >= 0)
                    {
                        string sub = text.Substring(pIdx + 7).TrimStart();
                        int endIdx = sub.IndexOfAny(new char[] { ',', '}', '\r', '\n' });
                        if (endIdx > 0)
                        {
                            int parsedPort;
                            if (int.TryParse(sub.Substring(0, endIdx).Trim(), out parsedPort))
                            {
                                serverPort = parsedPort;
                            }
                        }
                    }

                    int bIdx = text.IndexOf("\"autoOpenBrowser\":");
                    if (bIdx >= 0)
                    {
                        string sub = text.Substring(bIdx + 18).TrimStart().ToLower();
                        if (sub.StartsWith("false")) autoOpenBrowser = false;
                        else if (sub.StartsWith("true")) autoOpenBrowser = true;
                    }
                }
            }
            catch { }
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
