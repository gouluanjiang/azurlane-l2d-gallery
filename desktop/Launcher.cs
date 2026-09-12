using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
[assembly: AssemblyTitle("碧蓝航线图鉴")]
[assembly: AssemblyDescription("碧蓝航线 L2D 原图与玩法图解桌面软件")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]
static class Launcher {
    [STAThread]
    static void Main() {
        try {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string program = Path.Combine(root, ".desktop", "碧蓝航线图鉴.exe");
            if (!File.Exists(program) || !File.Exists(Path.Combine(root, "data", "catalog.json"))) {
                MessageBox.Show("未找到完整程序与图鉴资料。请保留软件所在的整个文件夹。", "碧蓝航线图鉴", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            var info = new ProcessStartInfo(program);
            info.WorkingDirectory = root;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            Process.Start(info);
        } catch (Exception error) {
            MessageBox.Show("启动失败：" + error.Message, "碧蓝航线图鉴", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
