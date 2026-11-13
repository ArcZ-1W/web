using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Text;
using System.Reflection;
using System.Runtime.InteropServices;

[assembly: AssemblyTitle("MyPNK Cloud Server")]
[assembly: AssemblyDescription("Sistem Cloud & Alat Kelas Mandiri - Pelita Nusantara Kasih")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("Sekolah Kristen Pelita Nusantara Kasih Surakarta")]
[assembly: AssemblyProduct("MyPNK Cloud")]
[assembly: AssemblyCopyright("Copyright (C) 2026")]
[assembly: AssemblyTrademark("Pelita Nusantara Kasih")]
[assembly: AssemblyCulture("")]
[assembly: ComVisible(false)]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace MyPnkLauncher
{
    class Program
    {
        private static Process serverProcess = null;
        private static volatile bool isRunning = true;
        private static int serverPort = 3000;
        private static bool autoOpenBrowser = true;
        private static readonly string appDir = AppDomain.CurrentDomain.BaseDirectory;

        static void Main(string[] args)
        {
            Console.Title = "MyPNK Cloud Server - Launcher";
            Console.OutputEncoding = Encoding.UTF8;

            AppDomain.CurrentDomain.ProcessExit += (s, e) => CleanExitServer();
            Console.CancelKeyPress += (s, e) => {
                e.Cancel = true;
                isRunning = false;
                CleanExitServer();
                Environment.Exit(0);
            };

            LoadConfig();
            DrawBanner();

            string nodePath = FindNodeExecutable();
            if (string.IsNullOrEmpty(nodePath))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine(" [!] Node.js (node.exe) tidak ditemukan.");
                Console.ResetColor();
                Console.WriteLine("     Silakan pasang Node.js dari https://nodejs.org/");
                Console.WriteLine("\n Tekan sembarang tombol untuk keluar...");
                Console.ReadKey();
                return;
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine(" [*] Node.js terdeteksi: " + nodePath);
            Console.ResetColor();

            StartServer(nodePath);

            if (autoOpenBrowser)
            {
                Thread.Sleep(1200);
                OpenBrowser();
            }

            Console.WriteLine("\n Menu Kontrol:");
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("   [O] Buka di Browser  |  [R] Restart Server  |  [C] Buka Config  |  [Q] Keluar");
            Console.ResetColor();
            Console.WriteLine(new string('-', 62));

            while (isRunning)
            {
                if (Console.KeyAvailable)
                {
                    ConsoleKeyInfo key = Console.ReadKey(true);
                    if (key.Key == ConsoleKey.O)
                    {
                        OpenBrowser();
                    }
                    else if (key.Key == ConsoleKey.R)
                    {
                        Console.ForegroundColor = ConsoleColor.Cyan;
                        Console.WriteLine("\n [*] Merestart server...");
                        Console.ResetColor();
                        CleanExitServer();
                        Thread.Sleep(1000);
                        StartServer(nodePath);
                    }
                    else if (key.Key == ConsoleKey.C)
                    {
                        OpenConfigFile();
                    }
                    else if (key.Key == ConsoleKey.Q || key.Key == ConsoleKey.X)
                    {
                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine("\n [*] Menghentikan server dan keluar...");
                        Console.ResetColor();
                        isRunning = false;
                        break;
                    }
                }
                Thread.Sleep(100);
            }

            CleanExitServer();
        }

        static void DrawBanner()
        {
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("==============================================================");
            Console.WriteLine("             MYPNK CLOUD - PORTABLE SERVER LAUNCHER          ");
            Console.WriteLine("           Sekolah Kristen Pelita Nusantara Kasih            ");
            Console.WriteLine("==============================================================");
            Console.ResetColor();
            Console.WriteLine(" Lokasi Server : " + appDir);
            Console.WriteLine(" Port Layanan  : " + serverPort);
            Console.WriteLine(" Status        : Siap digunakan");
            Console.WriteLine(new string('-', 62));
        }

        static void LoadConfig()
        {
            try
            {
                string configPath = Path.Combine(appDir, "config.json");
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
                else
                {
                    string defaultJson = "{\n  \"appName\": \"MyPNK Cloud\",\n  \"port\": 3000,\n  \"autoOpenBrowser\": true,\n  \"notifications\": {\n    \"enabled\": true,\n    \"vibrate\": true\n  }\n}";
                    File.WriteAllText(configPath, defaultJson, Encoding.UTF8);
                }
            }
            catch { }
        }

        static string FindNodeExecutable()
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

        static void StartServer(string nodePath)
        {
            try
            {
                string serverScript = Path.Combine(appDir, "server.js");
                if (!File.Exists(serverScript))
                {
                    serverScript = Path.Combine(Directory.GetParent(appDir).FullName, "server.js");
                }

                if (!File.Exists(serverScript))
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine(" [!] Error: server.js tidak ditemukan.");
                    Console.ResetColor();
                    return;
                }

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodePath;
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
                        Console.ForegroundColor = ConsoleColor.White;
                        Console.WriteLine(" [SERVER] " + e.Data);
                        Console.ResetColor();
                    }
                };

                serverProcess.ErrorDataReceived += (s, e) => {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine(" [INFO] " + e.Data);
                        Console.ResetColor();
                    }
                };

                serverProcess.Start();
                serverProcess.BeginOutputReadLine();
                serverProcess.BeginErrorReadLine();

                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine(" [OK] Server aktif pada: http://localhost:" + serverPort);
                Console.ResetColor();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine(" [!] Gagal menjalankan server: " + ex.Message);
                Console.ResetColor();
            }
        }

        static void OpenBrowser()
        {
            try
            {
                string url = "http://localhost:" + serverPort;
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine(" [*] Membuka browser: " + url);
                Console.ResetColor();
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Console.WriteLine(" [!] Tidak dapat membuka browser: " + ex.Message);
            }
        }

        static void OpenConfigFile()
        {
            try
            {
                string configPath = Path.Combine(appDir, "config.json");
                if (File.Exists(configPath))
                {
                    Process.Start("notepad.exe", "\"" + configPath + "\"");
                }
            }
            catch { }
        }

        static void CleanExitServer()
        {
            try
            {
                if (serverProcess != null && !serverProcess.HasExited)
                {
                    serverProcess.Kill();
                    serverProcess.WaitForExit(1000);
                    serverProcess = null;
                }
            }
            catch { }
        }
    }
}
