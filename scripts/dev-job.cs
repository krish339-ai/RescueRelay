// A private Windows job owns this launch's process tree. No PID/port-based kills.
// References: learn.microsoft.com/windows/win32/procthread/job-objects
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public sealed class RescueRelayJob : IDisposable {
    IntPtr job, process;
    uint processId;
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct StartupInfo {
        public uint cb;
        public string reserved, desktop, title;
        public uint x, y, xSize, ySize, xCountChars, yCountChars, fillAttribute, flags;
        public ushort showWindow, reserved2;
        public IntPtr reserved2Ptr, stdInput, stdOutput, stdError;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {
        public IntPtr process, thread;
        public uint processId, threadId;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits info, uint length);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool CreateProcess(string app, StringBuilder command, IntPtr processAttrs, IntPtr threadAttrs,
        bool inherit, uint flags, IntPtr environment, string directory, ref StartupInfo startup, out ProcessInfo info);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint ms);
    [DllImport("kernel32.dll")] static extern bool GenerateConsoleCtrlEvent(uint kind, uint group);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    public RescueRelayJob(string app, string command, string directory) {
        job = CreateJobObject(IntPtr.Zero, null); // Unnamed; only this supervisor holds it.
        if (job == IntPtr.Zero) throw new Win32Exception();
        try {
            var limits = new ExtendedLimits();
            limits.BasicLimitInformation.LimitFlags = 0x2000; // KILL_ON_JOB_CLOSE; no breakaway.
            if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)))
                throw new Win32Exception();
            var startup = new StartupInfo();
            startup.cb = (uint)Marshal.SizeOf(startup);
            ProcessInfo info;
            // Suspended until assigned: children cannot escape the job during startup.
            if (!CreateProcess(app, new StringBuilder(command), IntPtr.Zero, IntPtr.Zero, false,
                0x00000004 | 0x00000200, IntPtr.Zero, directory, ref startup, out info))
                throw new Win32Exception();
            process = info.process;
            processId = info.processId;
            try {
                if (!AssignProcessToJobObject(job, process)) {
                    int error = Marshal.GetLastWin32Error();
                    TerminateProcess(process, 1); // Only our still-suspended process handle.
                    throw new Win32Exception(error);
                }
                if (ResumeThread(info.thread) == 0xffffffff) throw new Win32Exception();
            } finally { CloseHandle(info.thread); }
        } catch { Dispose(); throw; }
    }
    public bool HasExited { get { return WaitForSingleObject(process, 0) == 0; } }
    public uint ExitCode { get { uint code; GetExitCodeProcess(process, out code); return code; } }
    public void Stop() {
        if (process != IntPtr.Zero && !HasExited) {
            // Only the process group we created; never broadcast to console group zero.
            GenerateConsoleCtrlEvent(1, processId);
            WaitForSingleObject(process, 3000);
        }
        Dispose();
    }
    public void Dispose() {
        if (job != IntPtr.Zero) { TerminateJobObject(job, 0); CloseHandle(job); job = IntPtr.Zero; }
        if (process != IntPtr.Zero) { CloseHandle(process); process = IntPtr.Zero; }
    }
}
