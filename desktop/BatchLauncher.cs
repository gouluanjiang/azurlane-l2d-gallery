using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
[assembly: AssemblyTitle("碧蓝航线试玩台 · 第一批")]
[assembly: AssemblyVersion("1.3.0.0")]
static class BatchLauncher {
    [STAThread] static void Main() {
        try {
            string root=AppDomain.CurrentDomain.BaseDirectory;
            string program=Path.Combine(root,".desktop-batch-1","碧蓝航线图鉴.exe");
            if(!File.Exists(program)||!File.Exists(Path.Combine(root,"data","catalog.json"))) {
                MessageBox.Show("请保留试玩台所在的完整图鉴文件夹。","碧蓝航线试玩台",MessageBoxButtons.OK,MessageBoxIcon.Error);return;
            }
            var info=new ProcessStartInfo(program);
            info.Arguments="--open-sample";info.WorkingDirectory=root;info.UseShellExecute=false;info.CreateNoWindow=true;info.WindowStyle=ProcessWindowStyle.Normal;
            info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");Process.Start(info);
        } catch(Exception error) { MessageBox.Show("试玩台启动失败："+error.Message,"碧蓝航线试玩台",MessageBoxButtons.OK,MessageBoxIcon.Error); }
    }
}
