!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Name "Bakesale POS Server"
OutFile "..\dist\Bakesale-Server-Setup.exe"
InstallDir "C:\Bakesale"
RequestExecutionLevel admin

; Variables - removed SecretKey since it's now generated inside setup.bat
Var Dialog
Var PasswordLabel
Var PasswordBox
Var ConfirmLabel
Var ConfirmBox
Var DBPassword
Var DBPasswordConfirm

!define MUI_ABORTWARNING
!define MUI_ICON "..\electron\assets\icon.ico"

!insertmacro MUI_PAGE_WELCOME
Page custom PasswordPage PasswordPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"

Function PasswordPage
    nsDialogs::Create 1018
    Pop $Dialog

    ${NSD_CreateLabel} 0 0u 100% 30u "Enter a password for the database.$\n$\nIf PostgreSQL is already installed on this PC, enter your existing PostgreSQL password.$\nIf not installed, enter a new password (min 6 characters)."
    Pop $PasswordLabel

    ${NSD_CreatePassword} 0 35u 100% 14u ""
    Pop $PasswordBox

    ${NSD_CreateLabel} 0 55u 100% 12u "Confirm password:"
    Pop $ConfirmLabel

    ${NSD_CreatePassword} 0 70u 100% 14u ""
    Pop $ConfirmBox

    nsDialogs::Show
FunctionEnd

Function PasswordPageLeave
    ${NSD_GetText} $PasswordBox $DBPassword
    ${NSD_GetText} $ConfirmBox $DBPasswordConfirm

    ${If} $DBPassword == ""
        MessageBox MB_OK|MB_ICONEXCLAMATION "Please enter a password!"
        Abort
    ${EndIf}

    ${If} $DBPassword != $DBPasswordConfirm
        MessageBox MB_OK|MB_ICONEXCLAMATION "Passwords do not match! Please try again."
        Abort
    ${EndIf}

    StrLen $0 $DBPassword
    ${If} $0 < 6
        MessageBox MB_OK|MB_ICONEXCLAMATION "Password must be at least 6 characters!"
        Abort
    ${EndIf}
FunctionEnd

Section "Install"
    SetOutPath "$INSTDIR"

    CreateDirectory "C:\Bakesale"
    CreateDirectory "C:\Bakesale\logs"

    DetailPrint "Copying backend files..."
    SetOutPath "$INSTDIR\backend"
    File /r "..\backend\*.*"

    DetailPrint "Copying frontend files..."
    SetOutPath "$INSTDIR\frontend"
    File /r "..\frontend\*.*"

    DetailPrint "Copying electron files..."
    SetOutPath "$INSTDIR\electron"
    File /r "..\electron\*.*"

    DetailPrint "Copying root files..."
    SetOutPath "$INSTDIR"
    File "..\package.json"
    File "..\UPDATE.bat"
    File "..\SETUP-FRONTEND.bat"
    File "..\BUILD-INSTALLER.bat"
    File "..\START.bat"
    File "..\START-DEV.bat"

    DetailPrint "Copying installers..."
    SetOutPath "$INSTDIR\redist"
    File "redist\python-3.11.9-installer.exe"
    File "redist\node-v24.13.1-x64.msi"
    File "redist\postgresql-18-installer.exe"
    File "redist\nssm.exe"
    File "setup.bat"

    ; Run setup - secret key is now generated inside setup.bat after Python is ready
    DetailPrint "Installing components and setting up server..."
    DetailPrint "This may take 5-10 minutes, please wait..."
    nsExec::ExecToLog '"$INSTDIR\redist\setup.bat" "$DBPassword"'
    Pop $0
    ${If} $0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "Setup failed! Please check logs at C:\Bakesale\logs\error.log"
        Abort
    ${EndIf}

    WriteUninstaller "$INSTDIR\Uninstall.bat"
SectionEnd

Function .onInstSuccess
    ; Get LAN IP using reliable method
    nsExec::ExecToStack 'powershell -NoProfile -Command "([System.Net.Dns]::GetHostAddresses($env:COMPUTERNAME) | Where-Object {$_.AddressFamily -eq ''InterNetwork''} | Select-Object -First 1).IPAddressToString"'
    Pop $0
    Pop $1

    ${If} $1 == ""
        StrCpy $1 "Could not detect IP - check your network settings"
    ${EndIf}

    MessageBox MB_OK|MB_ICONINFORMATION \
        "Bakesale Server installed successfully!$\n$\n\
        Server IP Address: $1$\n$\n\
        Tell client PCs to use this IP when setting up.$\n$\n\
        Default Login:$\n\
        Username: admin$\n\
        Password: admin123$\n$\n\
        The server starts automatically on every boot.$\n$\n\
        Next step: Install Bakesale POS Setup on this PC$\n\
        and select Main Server on first launch."
FunctionEnd

Section "Uninstall"
    nsExec::Exec 'net stop BakesaleBackend'
    timeout /t 2
    nsExec::Exec '"C:\Bakesale\redist\nssm.exe" remove BakesaleBackend confirm'
    nsExec::Exec 'netsh advfirewall firewall delete rule name="Bakesale POS"'
    RMDir /r "C:\Bakesale"
SectionEnd
