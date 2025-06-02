# Auto Stack for Burst Photos in Adobe Bridge 2025

This script enhances Adobe Bridge 2025 by automatically stacking burst mode (continuous shooting) photos—images captured in the same or adjacent second, regardless of whether they're in RAW or JPEG format. It's a customized extension of Adobe Bridge’s Auto Stack Panorama/HDR feature, repurposed for burst photo organization.

## ✨ Features

- Automatically detects and stacks burst images based on capture time
- Supports both RAW and JPEG formats
- Groups images taken within the same or adjacent seconds
- Maintains original folder structure
- Seamlessly integrates with Adobe Bridge’s native stacking system

## 📦 Installation

### macOS

1. Copy the script to the following directory:

```
$HOME/Library/Application Support/Adobe/Bridge 2025/Startup Scripts
```

2. Restart Adobe Bridge.

3. Enable the script:
- Open Adobe Bridge
- Go to **Preferences** (`⌘,`)
- Select **Startup Scripts**
- Check the box next to **Yi's Auto Collection**

### Windows

This script *should* also work on Windows, but it hasn't been tested. On Windows, the equivalent script path is typically:

```
%APPDATA%\Adobe\Bridge 2025\Startup Scripts
```

## ▶️ Usage

1. Open Adobe Bridge and navigate to your target folder.
2. In the top menu bar, go to **Stacks** > **Auto-Stack Bursts**.
3. The script will:
   - Identify burst-mode image sequences
   - Automatically group and stack matching images

## 🖥 Requirements

- Adobe Bridge 2025
- macOS
- Windows (not tested, but expected to work)

## 📝 Notes

- This script is a repurposed version of Adobe’s Auto Stack Panorama/HDR feature, adapted for burst detection.
- It creates *virtual* stacks only—no original files are modified.
- You can unstack grouped images at any time using Bridge’s native unstack option.

## 📄 License

This script is derived from Adobe’s Auto Stack Panorama/HDR script. Please refer to Adobe’s licensing terms for details on usage and redistribution.
