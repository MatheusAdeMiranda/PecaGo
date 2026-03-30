$ErrorActionPreference = "Stop"

function Resolve-Python {
    $command = Get-Command python -ErrorAction SilentlyContinue
    if ($command -and $command.Source -notlike "*WindowsApps*") {
        return $command.Source
    }

    $candidates = Get-ChildItem "$env:LOCALAPPDATA\Programs\Python" -Recurse -Filter python.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notlike "*\\Lib\\venv\\*" } |
        Sort-Object FullName -Descending

    if ($candidates) {
        return $candidates[0].FullName
    }

    return $null
}

$python = Resolve-Python
if (-not $python) {
    Write-Host "Python nao encontrado. Instale Python 3.12+ e tente novamente."
    exit 1
}

if (-not (Test-Path ".venv")) {
    & $python -m venv .venv
}

& .\.venv\Scripts\Activate.ps1
& $python -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt

if (-not (Test-Path ".env")) {
    @"
DATABASE_URL=sqlite:///./autoparts_mvp.db
SECRET_KEY=change-me
ACCESS_TOKEN_EXPIRE_MINUTES=720
"@ | Set-Content .env
}

& .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
