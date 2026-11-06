using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
[assembly: AssemblyTitle("碧蓝航线试玩样例")]
[assembly: AssemblyVersion("1.2.0.0")]
static class SampleLauncher {
    [STAThread] static void Main() {
        try {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string program = Path.Combine(root, ".desktop-sample", "碧蓝航线图鉴.exe");
            if (!File.Exists(program) || !File.Exists(Path.Combine(root, "data", "catalog.json"))) {
                MessageBox.Show("请保留试玩样例所在的完整图鉴文件夹。", "碧蓝航线试玩样例", MessageBoxButtons.OK, MessageBoxIcon.Error); return;
            }
            var info = new ProcessStartInfo(program);
            info.Arguments = "--open-sample";
            info.WorkingDirectory = root;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            Process.Start(info);
        } catch (Exception error) { MessageBox.Show("样例启动失败：" + error.Message, "碧蓝航线试玩样例", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}
