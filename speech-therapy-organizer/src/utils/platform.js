// The user-facing name for the OS file manager, for copy only — never for behavior.
// window.api.revealInFinder already calls Electron's shell.showItemInFolder, which
// opens the correct file manager on its own regardless of platform; this just keeps
// what we SAY about it accurate on Windows instead of always saying "Finder."
export const fileManagerName = () => (window.api?.platform === 'win32' ? 'Explorer' : 'Finder')
