import inkex
from inkex import TextElement, Rectangle, Ellipse, Tspan, Layer, Group
import os
import sys
import json
import threading
import http.server
import socketserver
import webbrowser
import socket
import random
import math
import base64

# Try to load GTK and WebKit2
try:
    import gi
    gi.require_version('Gtk', '3.0')
    gi.require_version('WebKit2', '4.1')
    from gi.repository import Gtk, WebKit2, GLib
    GTK_UI_AVAILABLE = True
except (ImportError, ValueError):
    try:
        import gi
        gi.require_version('Gtk', '3.0')
        gi.require_version('WebKit2', '4.0')
        from gi.repository import Gtk, WebKit2, GLib
        GTK_UI_AVAILABLE = True
    except:
        GTK_UI_AVAILABLE = False

# Redirect stderr to a log file
log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'extension_debug.log')
log_file = open(log_path, 'w')
os.dup2(log_file.fileno(), sys.stderr.fileno())

class PatternFillExtension(inkex.EffectExtension):
    """Inkscape extension to fill a shape with selected objects."""

    class WebUIHandler(http.server.SimpleHTTPRequestHandler):
        """Handler for the Web UI HTTP server."""
        
        def __init__(self, *args, extension_instance=None, **kwargs):
            self.extension_instance = extension_instance
            super().__init__(*args, **kwargs)

        def log_message(self, format, *args):
            pass

        def do_GET(self):
            if self.path == '/status':
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(self.extension_instance.status_data).encode('utf-8'))
            elif self.path == '/selection':
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                
                selection = []
                for node in self.extension_instance.svg.selection:
                    # Create a tiny standalone SVG for thumbnail
                    thumbnail_svg = ""
                    try:
                        bbox = node.bounding_box()
                        if bbox and bbox.width > 0 and bbox.height > 0:
                            cloned = node.copy()
                            node_str = cloned.tostring().decode('utf-8')
                            w = bbox.width
                            h = bbox.height
                            thumbnail_svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{bbox.left} {bbox.top} {w} {h}" width="60" height="60">{node_str}</svg>'
                    except Exception:
                        thumbnail_svg = ""
                    
                    node_id = node.get('id') or ''
                    node_label = node.label if node.label else node_id
                    
                    # Get path data if it's a path - transform to document coords!
                    path_d = ""
                    if hasattr(node, 'path'):
                        try:
                            transformed_path = node.path.transform(node.composed_transform())
                            path_d = str(transformed_path)
                        except Exception:
                            path_d = str(node.path)
                    
                    # Detect fill color for container filtering
                    fill = ''
                    style_str = node.get('style') or ''
                    if 'fill:' in style_str:
                        for part in style_str.split(';'):
                            if part.strip().startswith('fill:'):
                                fill = part.split(':')[1].strip()
                                break
                    
                    # Container candidates: path elements with black fill
                    is_container = (node.TAG == 'path' and fill.lower() in ('#000000', '#000', 'black'))
                    
                    selection.append({
                        'id': node_id,
                        'name': node_label,
                        'type': node.TAG,
                        'thumbnail': thumbnail_svg,
                        'fill': fill,
                        'is_container': is_container,
                        'path_d': path_d,
                        'bbox': {
                            'left': bbox.left if bbox else 0,
                            'top': bbox.top if bbox else 0,
                            'width': bbox.width if bbox else 0,
                            'height': bbox.height if bbox else 0
                        } if bbox else None
                    })
                
                self.wfile.write(json.dumps({'selection': selection}).encode('utf-8'))
            elif self.path == '/config':
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                
                config_path = os.path.join(os.path.dirname(__file__), 'config.json')
                config_data = {}
                if os.path.exists(config_path):
                    try:
                        with open(config_path, 'r') as f:
                            config_data = json.load(f)
                    except:
                        pass
                self.wfile.write(json.dumps(config_data).encode('utf-8'))
            else:
                super().do_GET()

        def do_POST(self):
            if self.path == '/submit' or self.path == '/preview':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                is_preview = self.path == '/preview'
                threading.Thread(target=self.extension_instance.process_background, args=(data, is_preview)).start()
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'started'}).encode('utf-8'))
                
            elif self.path == '/close':
                self.send_response(200)
                self.end_headers()
                if GTK_UI_AVAILABLE:
                    from gi.repository import GLib, Gtk
                    GLib.idle_add(Gtk.main_quit)
            
            elif self.path == '/config':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                config_path = os.path.join(os.path.dirname(__file__), 'config.json')
                try:
                    with open(config_path, 'w') as f:
                        json.dump(data, f, indent=4)
                except:
                    pass
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'saved'}).encode('utf-8'))

            elif self.path == '/save_preview':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                svg_content = data.get('svg', '')

                results_dir = os.path.join(os.path.dirname(__file__), 'results')
                if not os.path.exists(results_dir):
                    os.makedirs(results_dir)

                import time
                filename = f"preview_{int(time.time())}.svg"
                filepath = os.path.join(results_dir, filename)

                try:
                    with open(filepath, 'w') as f:
                        f.write(svg_content)
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'saved', 'filename': filename}).encode('utf-8'))
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode('utf-8'))

    def __init__(self):
        super().__init__()
        self.status_data = {"status": "idle", "progress": 0, "message": ""}
        self.is_processing = False
        self.preview_group_id = "pattern_fill_preview"
        
    def add_arguments(self, pars):
        pass

    def run_web_ui(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', 0))
            port = s.getsockname()[1]
        
        ui_dir = os.path.join(os.path.dirname(__file__), 'ui')
        handler_class = lambda *args, **kwargs: self.WebUIHandler(
            *args, extension_instance=self, directory=ui_dir, **kwargs
        )
        
        server = socketserver.TCPServer(("", port), handler_class)
        server_thread = threading.Thread(target=server.serve_forever)
        server_thread.daemon = True
        server_thread.start()
        
        url = f"http://localhost:{port}/index.html"
        
        if GTK_UI_AVAILABLE:
            heartbeat_id = GLib.timeout_add(100, lambda: True)
            GLib.idle_add(self._launch_gtk_window, url, server)
            Gtk.main()
            GLib.source_remove(heartbeat_id)
        else:
            webbrowser.open(url)
            while self.is_processing or self.status_data['status'] == 'idle':
                import time
                time.sleep(0.1)
        
        server.server_close()

    def _launch_gtk_window(self, url, server):
        window = Gtk.Window(title="Pattern Fill")
        window.set_default_size(550, 850)
        window.set_position(Gtk.WindowPosition.CENTER)
        window.set_resizable(True) # Allowed resizing as per user request
        
        webview = WebKit2.WebView()
        window.add(webview)
        webview.load_uri(url)
        
        def on_destroy(widget):
            server.shutdown()
            Gtk.main_quit()
            
        window.connect("destroy", on_destroy)
        window.show_all()

    def _get_shape_polygon(self, node, samples_per_segment=12):
        """Approximate the container shape as a polygon for point-in-shape testing.
        
        Uses path.transform() to convert to document coordinates first,
        then CubicSuperPath to handle arcs/curves, then samples beziers.
        """
        try:
            # Transform the path to document coordinates FIRST
            # This avoids issues with manual transform property access
            transformed_path = node.path.transform(node.composed_transform())
            path_d = str(transformed_path)
            
            # CubicSuperPath converts arcs, quadratics, etc. to cubic beziers
            try:
                from inkex.paths import CubicSuperPath
            except ImportError:
                from inkex import CubicSuperPath
            
            csp = CubicSuperPath(path_d)
            
            points = []
            for subpath in csp:
                for i in range(len(subpath) - 1):
                    p0 = subpath[i][1]       # current node [x, y]
                    h_out = subpath[i][2]    # outgoing handle [x, y]
                    h_in = subpath[i+1][0]   # incoming handle [x, y]
                    p1 = subpath[i+1][1]     # next node [x, y]
                    
                    # Sample cubic bezier - already in document coords
                    for step in range(samples_per_segment):
                        t = step / float(samples_per_segment)
                        mt = 1.0 - t
                        x = mt**3*p0[0] + 3*mt**2*t*h_out[0] + 3*mt*t**2*h_in[0] + t**3*p1[0]
                        y = mt**3*p0[1] + 3*mt**2*t*h_out[1] + 3*mt*t**2*h_in[1] + t**3*p1[1]
                        points.append((x, y))
                
                # Add final point of subpath
                if subpath:
                    lp = subpath[-1][1]
                    points.append((lp[0], lp[1]))
            
            # Close polygon
            if points and len(points) >= 3:
                if points[0] != points[-1]:
                    points.append(points[0])
                return points
            
            return None
        except Exception as e:
            # Log error for debugging
            try:
                log = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'polygon_debug.log')
                with open(log, 'w') as f:
                    f.write(f"_get_shape_polygon error: {e}\n")
                    f.write(f"path_d: {str(node.path)[:200]}\n")
                    import traceback
                    traceback.print_exc(file=f)
            except:
                pass
            return None

    @staticmethod
    def _point_in_polygon(x, y, polygon):
        """Ray casting algorithm for point-in-polygon test."""
        n = len(polygon)
        inside = False
        j = n - 1
        for i in range(n):
            xi, yi = polygon[i]
            xj, yj = polygon[j]
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                inside = not inside
            j = i
        return inside

    def _random_point_in_shape(self, bbox, polygon, max_attempts=100):
        """Get a random point that's inside the shape using rejection sampling."""
        for _ in range(max_attempts):
            rx = random.uniform(bbox.left, bbox.right)
            ry = random.uniform(bbox.top, bbox.bottom)
            if polygon is None or self._point_in_polygon(rx, ry, polygon):
                return rx, ry
        return (bbox.left + bbox.right) / 2, (bbox.top + bbox.bottom) / 2

    def _get_seed_radius(self, seed):
        """Get approximate radius of a seed object for collision detection."""
        try:
            sb = seed.bounding_box()
            if sb:
                return max(sb.width, sb.height) / 2.0
        except Exception:
            pass
        return 10.0  # fallback

    def _find_non_overlapping_position(self, bbox, polygon, placed, obj_radius, max_attempts=200):
        """Find a position inside the shape that doesn't overlap with placed objects.
        
        placed: list of (x, y, radius) tuples
        obj_radius: radius of the object being placed
        """
        for _ in range(max_attempts):
            rx = random.uniform(bbox.left, bbox.right)
            ry = random.uniform(bbox.top, bbox.bottom)
            
            # Check inside shape
            if polygon and not self._point_in_polygon(rx, ry, polygon):
                continue
            
            # Check no overlap with existing objects
            overlap = False
            for px, py, pr in placed:
                dist = math.sqrt((rx - px) ** 2 + (ry - py) ** 2)
                if dist < (obj_radius + pr) * 0.85:  # 0.85 = small tolerance for tight packing
                    overlap = True
                    break
            
            if not overlap:
                return rx, ry
        
        return None  # Could not find valid position

    def process_background(self, data, is_preview=False):
        """Processes pattern generation using pre-calculated positions from JS."""
        try:
            self.is_processing = True
            self.status_data = {"status": "processing", "progress": 10, "message": "Applying pattern..."}
            
            container_id = data.get('container_id')
            placed_objects = data.get('placed_objects', []) # List of {'seed_id': '...', 'transform': '...'}
            
            container = self.svg.getElementById(container_id)
            if container is None:
                raise ValueError(f"Container {container_id} not found.")

            if is_preview:
                # === WEB UI PREVIEW ===
                # The frontend already has the logic to preview, 
                # but we'll return a status to confirm we're done.
                self.status_data = {
                    "status": "completed", 
                    "progress": 100, 
                    "message": "Preview generated in UI!",
                }
            else:
                # === ACTUAL GENERATE ===
                try:
                    from inkex import Transform, Group
                    from lxml import etree
                    SVG_NS = 'http://www.w3.org/2000/svg'
                except ImportError:
                    from inkex.transforms import Transform
                    from inkex import Group
                    from lxml import etree
                    SVG_NS = 'http://www.w3.org/2000/svg'

                # We place into a group directly under the SVG root to ensure 
                # document-space coordinates (rx, ry) match perfectly.
                result_group = self.svg.add(Group())
                result_group.set('id', f"pattern_{random.randint(1000,9999)}")
                
                total = len(placed_objects)
                for i, obj in enumerate(placed_objects):
                    if i % 10 == 0:
                        self.status_data.update({
                            "progress": 20 + int(70 * (i / total if total > 0 else 1)),
                            "message": f"Inserting object {i+1}/{total}..."
                        })
                    
                    try:
                        # Use the exact SVG string from the preview
                        # This ensures visual identity (styles, attributes, etc.)
                        svg_str = f'<g xmlns="{SVG_NS}" transform="{obj["transform"]}">{obj["svg"]}</g>'
                        node = etree.fromstring(svg_str.encode('utf-8'))
                        result_group.append(node)
                    except Exception as e:
                        # Fallback to copy if string parsing fails
                        seed = self.svg.getElementById(obj['seed_id'])
                        if seed is not None:
                            clone = seed.copy()
                            clone.set('transform', obj['transform'])
                            result_group.append(clone)

                self.status_data = {
                    "status": "completed", 
                    "progress": 100, 
                    "message": f"Done! {len(placed_objects)} objects placed."
                }
                
                if GTK_UI_AVAILABLE:
                    import time
                    time.sleep(0.5)
                    from gi.repository import GLib, Gtk
                    GLib.idle_add(Gtk.main_quit)
                
        except Exception as e:
            self.status_data = {"status": "error", "progress": 0, "message": f"Error: {str(e)}"}
            try:
                import traceback
                with open('/tmp/ink_error.log', 'w') as f:
                    traceback.print_exc(file=f)
            except: pass
        finally:
            self.is_processing = False


    def effect(self):
        self.run_web_ui()

if __name__ == '__main__':
    PatternFillExtension().run()

