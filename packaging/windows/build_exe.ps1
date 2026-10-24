<#
  Build dist\CANviz.exe -- a single-file Windows app (no Python or Node.js
  needed on the target PC, only the Microsoft Edge WebView2 Runtime).

  Run from anywhere:
    powershell -ExecutionPolicy Bypass -File packaging\windows\build_exe.ps1

  Needs Python 3.10-3.13 and Node.js 20+. The build uses its own virtual
  environment in build\exe-venv, so your other environments are left alone.
  Pick the interpreter with -Python if "python" on PATH is not suitable:
    ...\build_exe.ps1 -Python C:\Python312\python.exe
#>

param(
    [string]$Python = 'python'
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path

# Native tools do not throw on failure -- check exit codes instead. While a
# tool runs, 'Continue' keeps Windows PowerShell 5.1 from treating warnings
# printed on stderr (npm, pip) as terminating errors.
function Invoke-Step([string]$What, [scriptblock]$Cmd) {
    Write-Host "==> $What" -ForegroundColor Cyan
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Cmd } finally { $ErrorActionPreference = $saved }
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)" }
}

# 1. Frontend -> backend\canviz\static
Push-Location "$Root\frontend"
try {
    Invoke-Step 'npm ci'        { npm ci }
    Invoke-Step 'npm run build' { npm run build }
} finally { Pop-Location }

# 2. Clean build environment with canviz[desktop] + PyInstaller
$Venv = "$Root\build\exe-venv"
if (-not (Test-Path "$Venv\Scripts\python.exe")) {
    Invoke-Step 'create venv' { & $Python -m venv $Venv }
}
$Py = "$Venv\Scripts\python.exe"
Invoke-Step 'upgrade pip'     { & $Py -m pip install --quiet --upgrade pip }
Invoke-Step 'install canviz'  { & $Py -m pip install --quiet "$Root\backend[desktop]" "pyinstaller>=6.10" }

# 3. One-file executable
Invoke-Step 'pyinstaller' {
    & $Py -m PyInstaller --noconfirm --clean `
        --distpath "$Root\dist" `
        --workpath "$Root\build\pyinstaller" `
        "$Root\packaging\windows\canviz.spec"
}

$Exe = Get-Item "$Root\dist\CANviz.exe"
Write-Host ("Built {0} ({1:N1} MB)" -f $Exe.FullName, ($Exe.Length / 1MB)) -ForegroundColor Green
