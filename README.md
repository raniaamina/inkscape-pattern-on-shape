# Pattern on Shape

A simple yet powerful Inkscape extension that randomly scatters objects (patterns) inside a specific boundary shape, complete with collision detection to prevent overlapping.

## Description

This extension helps you quickly generate scattered patterns within any path in Inkscape. It is particularly useful for creating background textures, filling spaces with scattered illustrations (like stars, dots, or thematic icons), and generating seamless-looking localized patterns. 

Built with a custom GTK+/WebKit2 User Interface, it provides a much richer and more interactive experience than standard Inkscape dialogs, including visual object selection, real-time progress bars, and standalone SVG previews.

## How to Use

<a href="https://www.youtube.com/watch?v=yiHe3MkBlbU"><img src="preview.webp"><br>Click to View Demo on Youtube</br><a>


1. **Select Container**: In Inkscape, select the object you want to use as the boundary/container.
2. **Select Patterns**: Select one or more objects you want to scatter inside that container.
3. **Launch Extension**: Group them (or just keep them selected together) and run the extension from `Extensions > Content Manager > Pattern on Shape...`
4. **Configure Settings**:
    - Choose your boundary shape from the **1. Container** dropdown.
    - Check the objects you want to use in the **2. Patterns** grid.
    - Adjust the **Quantity**, **Padding**, **Gap**, **Scale**, and **Rotation** in the **3. Settings** panel.
5. **Preview & Generate**:
    - Click **Test Preview** to generate the pattern.
    - Wait for the progress bar to finish.
    - You can save a standalone copy using **Save SVG Preview**.
    - Once satisfied, click **Generate Pattern** to import the results directly back into Inkscape.

## Requirements
*   **Inkscape 1.2+**
*   **Linux**: Works using GTK+ 3 and WebKit2Gtk. 
    *   **Native UI Setup**: To use the integrated native window (recommended), install these packages:
        ```bash
        sudo apt update
        sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1
        ```
        *(If 4.1 is not found, use `gir1.2-webkit2-4.0`)*
*   **macOS / Windows**: The extension will automatically open the UI in your default system browser. 
    *   *Note*: If `pywebview` is installed in your Python environment, it will run as a native window.

## Disclaimer 
We don't guarantee anything about this tool/extension, so please use it at your own risk. We can't give 24/7 support if you have a problem when using this boilerplate. 

If you feel that this tool has helped you to create, feel free to donate a cup of coffee on the [Support Dev](https://saweria.co/raniaamina) :")

## License
This project is licensed under the GNU General Public License v3.0 (GPLv3). See the [LICENSE](LICENSE) file for details.
