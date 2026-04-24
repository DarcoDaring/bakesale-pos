Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\Bakesale App\bakesale_complete"
WshShell.Run "cmd /c npx electron .", 0, False