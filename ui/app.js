document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('extension-form');
    const submitBtn = document.getElementById('btn-submit');
    const previewBtn = document.getElementById('btn-preview');
    const cancelBtn = document.getElementById('btn-cancel');
    const statusContainer = document.getElementById('status-container');
    const progressBar = document.getElementById('progress-bar');
    const statusMessage = document.getElementById('status-message');
    const containerSelect = document.getElementById('container_id');
    const patternGrid = document.getElementById('pattern-grid');
    const previewArea = document.getElementById('thumbnail-preview');
    const previewStatus = document.getElementById('preview-status');
    const savePreviewBtn = document.getElementById('btn-save-preview');
    const selectAllPatternsBtn = document.getElementById('select-all-patterns');
    const errorLogBox = document.getElementById('error-log-box');
    const testPath = document.getElementById('test-path');
    const testSvg = document.getElementById('test-svg');

    // Modal elements
    const btnAbout = document.getElementById('btn-about');
    const btnCloseAbout = document.getElementById('btn-close-about');
    const aboutModal = document.getElementById('about-modal');

    let pollInterval = null;
    let currentSelection = [];
    let selectedPatternIds = new Set();
    let currentPlacedObjects = [];

    // --- Select All Logic ---
    if (selectAllPatternsBtn) {
        selectAllPatternsBtn.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const allItems = patternGrid.querySelectorAll('.pattern-item');
            allItems.forEach(item => {
                const id = item.dataset.id;
                if (isChecked) {
                    item.classList.add('selected');
                    selectedPatternIds.add(id);
                } else {
                    item.classList.remove('selected');
                    selectedPatternIds.delete(id);
                }
            });
        });
    }

    // --- About Modal Logic ---
    if (btnAbout && aboutModal && btnCloseAbout) {
        btnAbout.addEventListener('click', () => {
            aboutModal.classList.remove('hidden');
        });

        const closeModal = () => {
            aboutModal.classList.add('hidden');
        };

        btnCloseAbout.addEventListener('click', closeModal);

        // Close when clicking outside modal content
        aboutModal.addEventListener('click', (e) => {
            if (e.target === aboutModal) {
                closeModal();
            }
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !aboutModal.classList.contains('hidden')) {
                closeModal();
            }
        });
    }

    // --- Preview Zoom/Pan ---
    let zoomLevel = 1;
    let panX = 0, panY = 0;
    let isPanning = false;
    let panStartX = 0, panStartY = 0;

    previewArea.addEventListener('wheel', (e) => {
        if (!previewArea.querySelector('svg')) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        zoomLevel = Math.max(0.1, Math.min(20, zoomLevel * delta));
        applyPreviewTransform();
    });

    previewArea.addEventListener('mousedown', (e) => {
        if (!previewArea.querySelector('svg')) return;
        isPanning = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        panX = e.clientX - panStartX;
        panY = e.clientY - panStartY;
        applyPreviewTransform();
    });

    window.addEventListener('mouseup', () => { isPanning = false; });

    function applyPreviewTransform() {
        const svg = previewArea.querySelector('svg');
        if (svg) {
            svg.style.transformOrigin = 'center center';
            svg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
        }
    }

    function resetPreviewTransform() {
        zoomLevel = 1;
        panX = 0;
        panY = 0;
    }

    // Fetch current selection on load
    async function initSelection() {
        try {
            const response = await fetch('/selection');
            const data = await response.json();
            currentSelection = data.selection || [];

            if (currentSelection.length > 0) {
                renderSelection();
                await loadConfig();
            } else {
                updateProgress(0, "No objects selected in Inkscape!", "error");
                statusContainer.classList.remove('hidden');
            }
        } catch (err) {
            console.error("Failed to fetch selection:", err);
        }
    }

    function renderSelection() {
        containerSelect.innerHTML = '<option value="" disabled selected>Select container...</option>';
        patternGrid.innerHTML = '';

        const containers = currentSelection.filter(item => item.is_container);
        const patterns = currentSelection.filter(item => !item.is_container);

        // Populate container dropdown (only black-fill paths)
        containers.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.name} (${item.id})`;
            containerSelect.appendChild(opt);
        });

        // Auto-select if only one container
        if (containers.length === 1) {
            containerSelect.value = containers[0].id;
            updateContainerPreview(containers[0]);
        }

        // Populate pattern grid (everything except containers)
        patterns.forEach(item => {
            const gridItem = document.createElement('div');
            gridItem.className = 'pattern-item';
            gridItem.dataset.id = item.id;

            const indicator = document.createElement('div');
            indicator.className = 'checkbox-indicator';
            gridItem.appendChild(indicator);

            if (item.thumbnail) {
                const thumbWrapper = document.createElement('div');
                thumbWrapper.innerHTML = item.thumbnail;
                gridItem.appendChild(thumbWrapper);
            } else {
                const noThumb = document.createElement('div');
                noThumb.style.color = '#444';
                noThumb.style.fontSize = '10px';
                noThumb.textContent = 'SVG';
                gridItem.appendChild(noThumb);
            }

            gridItem.addEventListener('click', () => {
                const id = item.id;
                if (gridItem.classList.contains('selected')) {
                    gridItem.classList.remove('selected');
                    selectedPatternIds.delete(id);
                } else {
                    gridItem.classList.add('selected');
                    selectedPatternIds.add(id);
                }

                // Sync select all checkbox
                const allItems = patternGrid.querySelectorAll('.pattern-item');
                if (selectAllPatternsBtn) {
                    selectAllPatternsBtn.checked = (selectedPatternIds.size === allItems.length) && (allItems.length > 0);
                }
            });

            patternGrid.appendChild(gridItem);

            // Default select all
            gridItem.classList.add('selected');
            selectedPatternIds.add(item.id);
        });
    }

    function updateContainerPreview(selectedObj) {
        if (selectedObj && selectedObj.thumbnail) {
            previewArea.innerHTML = selectedObj.thumbnail;
            const svg = previewArea.querySelector('svg');
            if (svg) {
                svg.style.width = '100%';
                svg.style.height = '100%';
                svg.style.opacity = '0.3';
            }
            previewStatus.textContent = "Boundary set";
        }
    }

    async function loadConfig() {
        try {
            const response = await fetch('/config');
            const config = await response.json();
            if (config && Object.keys(config).length > 0) {
                if (config.container_id) {
                    containerSelect.value = config.container_id;
                    const selectedObj = currentSelection.find(i => i.id === config.container_id);
                    updateContainerPreview(selectedObj);
                }
                if (config.count) document.getElementById('count').value = config.count;
                if (config.scale_min) document.getElementById('scale_min').value = config.scale_min;
                if (config.scale_max) document.getElementById('scale_max').value = config.scale_max;
                if (config.rotate_min) document.getElementById('rotate_min').value = config.rotate_min;
                if (config.rotate_max) document.getElementById('rotate_max').value = config.rotate_max;
                if (config.padding) document.getElementById('padding').value = config.padding;
                if (config.gap) document.getElementById('gap').value = config.gap;
                if (config.allow_overlap !== undefined) document.getElementById('allow_overlap').checked = config.allow_overlap;

                const backendSelect = document.getElementById('ui_backend');
                if (config.ui_backend && backendSelect) backendSelect.value = config.ui_backend;

                // Trigger event to disable/enable padding and gap inputs
                document.getElementById('allow_overlap').dispatchEvent(new Event('change'));
            }
        } catch (err) {
            console.error("Failed to load config:", err);
        }
    }

    async function saveConfig() {
        const formData = new FormData(form);
        const backendSelect = document.getElementById('ui_backend');
        const config = {
            container_id: containerSelect.value,
            count: formData.get('count'),
            scale_min: formData.get('scale_min'),
            scale_max: formData.get('scale_max'),
            rotate_min: formData.get('rotate_min'),
            rotate_max: formData.get('rotate_max'),
            padding: formData.get('padding'),
            gap: formData.get('gap'),
            allow_overlap: document.getElementById('allow_overlap').checked,
            ui_backend: backendSelect ? backendSelect.value : "auto"
        };
        try {
            await fetch('/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
        } catch (err) {
            console.error("Failed to save config:", err);
        }
    }

    // Save on any input/select change
    form.querySelectorAll('input, select').forEach(input => {
        if (input.id !== 'allow_overlap') { // We handle this separately below to avoid double save
            input.addEventListener('input', saveConfig);
            input.addEventListener('change', saveConfig);
        }
    });

    // Toggle padding/gap based on allow_overlap
    const allowOverlapCheckbox = document.getElementById('allow_overlap');
    const paddingInput = document.getElementById('padding');
    const gapInput = document.getElementById('gap');

    allowOverlapCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        paddingInput.disabled = checked;
        gapInput.disabled = checked;

        // Visual feedback
        paddingInput.closest('.form-group').style.opacity = checked ? '0.5' : '1';
        gapInput.closest('.form-group').style.opacity = checked ? '0.5' : '1';

        saveConfig();
    });

    const backendSelect = document.getElementById('ui_backend');
    if (backendSelect) {
        backendSelect.addEventListener('change', saveConfig);
    }
    containerSelect.addEventListener('change', () => {
        saveConfig();
        const selectedObj = currentSelection.find(i => i.id === containerSelect.value);
        updateContainerPreview(selectedObj);
    });

    initSelection();

    function calculatePlacement(params) {
        const containerObj = currentSelection.find(i => i.id === params.container_id);
        if (!containerObj || !containerObj.path_d) return [];

        const seeds = currentSelection.filter(i => params.pattern_ids.includes(i.id));
        if (seeds.length === 0) return [];

        // --- Calculate EXACT visual bounding boxes of seeds natively in the browser
        const seedData = {};
        const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        tempSvg.style.position = 'absolute';
        tempSvg.style.visibility = 'hidden';
        document.body.appendChild(tempSvg);

        for (const seed of seeds) {
            const contentMatcher = seed.thumbnail.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
            const innerSvgContent = contentMatcher ? contentMatcher[1] : '';

            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.innerHTML = innerSvgContent;
            tempSvg.appendChild(g);

            const box = g.getBBox();
            seedData[seed.id] = {
                cx: box.x + box.width / 2,
                cy: box.y + box.height / 2,
                width: box.width,
                height: box.height,
                innerStr: innerSvgContent
            };
            tempSvg.removeChild(g);
        }
        document.body.removeChild(tempSvg);

        testPath.setAttribute('d', containerObj.path_d);

        const userPadding = params.allow_overlap ? 0 : (params.padding !== undefined && params.padding !== null ? params.padding : 25) / 100;
        const userGap = params.allow_overlap ? 0 : (params.gap !== undefined && params.gap !== null ? params.gap : 4);

        const bbox = containerObj.bbox;
        const placed = [];
        let skipped = 0;
        const maxAttempts = params.allow_overlap ? 5000 : 500;

        // --- PREPARE STRATIFIED SAMPLING (GRID) ---
        // This ensures objects don't clump and fill the area uniformly
        const gridRes = Math.ceil(Math.sqrt(params.count * 1.5));
        const cells = [];
        for (let r = 0; r < gridRes; r++) {
            for (let c = 0; c < gridRes; c++) {
                cells.push({ r, c });
            }
        }
        // Simple fish-yates shuffle
        for (let idx = cells.length - 1; idx > 0; idx--) {
            const j = Math.floor(Math.random() * (idx + 1));
            [cells[idx], cells[j]] = [cells[j], cells[idx]];
        }

        for (let i = 0; i < params.count; i++) {
            let success = false;
            const cell = cells[i % cells.length];

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const seed = seeds[Math.floor(Math.random() * seeds.length)];

                // --- Adaptive Scaling (DISABLED to maintain uniform sizes) ---
                let shrinkFactor = 1.0;
                /*
                if (attempt > maxAttempts * 0.8) shrinkFactor = 0.3;
                else if (attempt > maxAttempts * 0.6) shrinkFactor = 0.5;
                else if (attempt > maxAttempts * 0.3) shrinkFactor = 0.8;
                */

                const baseScale = params.scale_min + Math.random() * (params.scale_max - params.scale_min);
                const scale = baseScale * shrinkFactor;
                const rotation = params.rotation_min + Math.random() * (params.rotation_max - params.rotation_min);

                const sData = seedData[seed.id];
                // Use the precise browser-calculated dimensions
                const radius = (Math.max(sData.width, sData.height) / 2) * scale;
                const paddedRadius = radius * (1 + userPadding);

                // --- JITTERED GRID SAMPLING ---
                // We pick a spot within a specific grid cell to ensure uniform coverage
                const cellW = bbox.width / gridRes;
                const cellH = bbox.height / gridRes;

                // If it's a first attempt, stay in the assigned cell. 
                // Following attempts can drift to nearby cells or be random if it's hard to find a spot.
                let rx, ry;
                if (attempt < 50) {
                    rx = bbox.left + (cell.c * cellW) + Math.random() * cellW;
                    ry = bbox.top + (cell.r * cellH) + Math.random() * cellH;
                } else {
                    rx = bbox.left + Math.random() * bbox.width;
                    ry = bbox.top + Math.random() * bbox.height;
                }

                // 1. Containment Check
                let inside = true;

                if (params.allow_overlap) {
                    // Overlapping objects still need to stay within the perimeter!
                    // We only use the base radius without user padding for bounds checking in overlap mode
                }

                // Strict multipoint check to ensure object bounds stay entirely inside the container shape
                const pointsToTest = [{ x: rx, y: ry }];
                const checkRadius = paddedRadius;

                // Increase sampling points to 16 for better precision at edges
                for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
                    pointsToTest.push({
                        x: rx + Math.cos(angle) * checkRadius,
                        y: ry + Math.sin(angle) * checkRadius
                    });
                }

                for (const pt of pointsToTest) {
                    const svgPt = testSvg.createSVGPoint();
                    svgPt.x = pt.x;
                    svgPt.y = pt.y;
                    if (!testPath.isPointInFill(svgPt)) {
                        inside = false;
                        break;
                    }
                }

                if (inside) {
                    // 2. Strict Collision & Neighbor Diversity
                    let collision = false;
                    let neighborSameSeed = false;

                    if (!params.allow_overlap) {
                        for (const p of placed) {
                            const dx = rx - p.x;
                            const dy = ry - p.y;
                            const distSq = dx * dx + dy * dy;

                            // Use user-defined absolute gap
                            const minDist = paddedRadius + (p.pRadius || p.radius) + userGap;

                            if (distSq < minDist * minDist) {
                                collision = true;
                                break;
                            }

                            // Diversity: Avoid same seed too close (Relaxed to 1.5x for better density)
                            const diversityDist = (radius + p.radius) * 1.5;
                            if (p.seed_id === seed.id && distSq < diversityDist * diversityDist) {
                                neighborSameSeed = true;
                            }
                        }
                    }

                    if (!collision && (params.allow_overlap || !neighborSameSeed || attempt > maxAttempts / 2)) {
                        const transform = `translate(${rx},${ry}) rotate(${rotation}) scale(${scale}) translate(${-sData.cx},${-sData.cy})`;

                        placed.push({
                            x: rx,
                            y: ry,
                            radius: radius,
                            pRadius: paddedRadius,
                            seed_id: seed.id,
                            transform: transform,
                            svg: sData.innerStr
                        });
                        success = true;
                        break;
                    }
                }
            }
            if (!success) skipped++;
        }

        console.log(`Requested ${params.count}, Placed ${placed.length}, skipped ${skipped}`);
        return placed;
    }

    function renderPreview(containerId, placed) {
        const containerObj = currentSelection.find(i => i.id === containerId);
        if (!containerObj) return;

        const bbox = containerObj.bbox;
        const vb = `${bbox.left} ${bbox.top} ${bbox.width} ${bbox.height}`;

        // Render exactly the placed objects
        const objectsHtml = placed.map(p => {
            return `<g transform="${p.transform}">${p.svg}</g>`;
        }).join('');

        const previewSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb}" width="100%" height="100%" style="background:#d1d1d1;">
                <g style="fill:#111; opacity:0.3;">
                    <path d="${containerObj.path_d}"></path>
                </g>
                ${objectsHtml}
            </svg>
        `;

        previewArea.innerHTML = previewSvg;
        resetPreviewTransform();
        applyPreviewTransform();

        previewStatus.textContent = `Preview: ${placed.length} objects (Target: ${form.count.value})`;
    }

    let currentParamsJson = "";

    async function sendRequest(url) {
        const formData = new FormData(form);
        const params = {
            container_id: containerSelect.value,
            pattern_ids: Array.from(selectedPatternIds),
            count: parseInt(formData.get('count') || 10),
            scale_min: parseFloat(formData.get('scale_min') || 1.0),
            scale_max: parseFloat(formData.get('scale_max') || 1.0),
            rotation_min: parseFloat(formData.get('rotate_min') || 0),
            rotation_max: parseFloat(formData.get('rotate_max') || 0),
            padding: parseFloat(formData.get('padding') || 25),
            gap: parseFloat(formData.get('gap') || 4),
            allow_overlap: document.getElementById('allow_overlap').checked
        };

        if (!params.container_id) {
            alert("Please select a black boundary shape.");
            return;
        }

        if (params.pattern_ids.length === 0) {
            alert("Please select patterns.");
            return;
        }

        const paramsJson = JSON.stringify(params);
        const isPreview = url.includes('preview');

        // Calculate placement IF it's a preview OR if we don't have cached data yet
        // For non-preview submission, we STRICTLY reuse if data exists to ensure parity
        const needsCalculation = isPreview || currentPlacedObjects.length === 0 || paramsJson !== currentParamsJson;

        if (needsCalculation) {
            console.log("Calculating new placement...");
            currentPlacedObjects = calculatePlacement(params);
            currentParamsJson = paramsJson;
        } else {
            console.log("Reusing existing preview data for final output.");
        }

        if (isPreview) {
            renderPreview(params.container_id, currentPlacedObjects);
            return;
        }

        submitBtn.disabled = true;
        previewBtn.disabled = true;
        statusContainer.classList.remove('hidden');
        updateProgress(10, "Generating pattern in Inkscape...", "normal");

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    container_id: params.container_id,
                    placed_objects: currentPlacedObjects
                })
            });

            if (response.ok) {
                pollStatus();
            } else {
                updateProgress(0, "Request failed.", "error");
                submitBtn.disabled = false;
                previewBtn.disabled = false;
            }
        } catch (err) {
            updateProgress(0, `Error: ${err.message}`, "error");
            submitBtn.disabled = false;
            previewBtn.disabled = false;
        }
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        sendRequest('/submit');
    });

    previewBtn.addEventListener('click', () => {
        sendRequest('/preview');
    });

    cancelBtn.addEventListener('click', async () => {
        try {
            await fetch('/close', { method: 'POST' });
        } catch (err) {
            console.error(err);
        }
    });

    savePreviewBtn.addEventListener('click', async () => {
        const svgElement = previewArea.querySelector('svg');
        if (!svgElement) {
            updateProgress(0, "No preview to save!", "error");
            return;
        }

        try {
            savePreviewBtn.disabled = true;
            savePreviewBtn.textContent = "Saving...";

            const svgData = svgElement.outerHTML;
            const response = await fetch('/save_preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ svg: svgData })
            });

            const result = await response.json();
            if (result.status === 'saved') {
                updateProgress(100, `Saved to: ${result.filename}`, "normal");
            } else {
                throw new Error(result.message || "Failed to save");
            }
        } catch (err) {
            console.error("Save preview error:", err);
            updateProgress(0, `Save failed: ${err.message}`, "error");
        } finally {
            savePreviewBtn.disabled = false;
            savePreviewBtn.textContent = "Save SVG Preview";
        }
    });

    function updateProgress(percent, message, state = "normal") {
        progressBar.style.width = `${percent}%`;

        if (state === "error") {
            progressBar.classList.add('error');
            previewStatus.style.color = "var(--error-color)";
            previewStatus.textContent = "Error";

            // Clear right-panel status message and let the progress bar stay red
            statusMessage.textContent = "";

            if (errorLogBox) {
                errorLogBox.textContent = message;
                errorLogBox.classList.remove('hidden');
            }
        } else {
            progressBar.classList.remove('error');
            previewStatus.style.color = "var(--success-color)";
            statusMessage.textContent = message;

            if (errorLogBox) {
                errorLogBox.classList.add('hidden');
            }
        }
    }

    async function pollStatus() {
        if (pollInterval) clearInterval(pollInterval);

        pollInterval = setInterval(async () => {
            try {
                const response = await fetch('/status');
                const state = await response.json();

                updateProgress(state.progress, state.message, state.status === 'error' ? 'error' : 'normal');

                if (state.status === 'completed' || state.status === 'error') {
                    clearInterval(pollInterval);
                    submitBtn.disabled = false;
                    previewBtn.disabled = false;

                    // Specific logic to cleanly self-close the window on Completion
                    if (state.status === 'completed') {
                        setTimeout(() => {
                            // Notify backend we're deliberately closing
                            fetch('/close').catch(() => { });
                            // Self-close the window (works automatically for App Mode windows)
                            window.open('', '_self', '');
                            window.close();
                        }, 1000); // 1-second delay so user can read the success message
                    }
                }
            } catch (err) {
                console.error("Polling error:", err);
                clearInterval(pollInterval);
                submitBtn.disabled = false;
                previewBtn.disabled = false;
            }
        }, 500);
    }

    initSelection();

    // Heartbeat to keep backend alive when running in browser mode
    setInterval(() => {
        fetch('/heartbeat').catch(() => { });
    }, 500);
});
