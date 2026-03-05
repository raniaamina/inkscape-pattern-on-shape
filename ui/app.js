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

    const testPath = document.getElementById('test-path');
    const testSvg = document.getElementById('test-svg');

    let pollInterval = null;
    let currentSelection = [];
    let selectedPatternIds = new Set();
    let currentPlacedObjects = [];

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
            }
        } catch (err) {
            console.error("Failed to load config:", err);
        }
    }

    async function saveConfig() {
        const formData = new FormData(form);
        const config = {
            container_id: containerSelect.value,
            count: formData.get('count'),
            scale_min: formData.get('scale_min'),
            scale_max: formData.get('scale_max'),
            rotate_min: formData.get('rotate_min'),
            rotate_max: formData.get('rotate_max'),
            padding: formData.get('padding'),
            gap: formData.get('gap')
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
    form.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', saveConfig);
    });
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

        testPath.setAttribute('d', containerObj.path_d);

        const userPadding = (params.padding || 25) / 100;
        const userGap = (params.gap || 4);

        const bbox = containerObj.bbox;
        const placed = [];
        let skipped = 0;
        const maxAttempts = 500;


        for (let i = 0; i < params.count; i++) {
            let success = false;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const seed = seeds[Math.floor(Math.random() * seeds.length)];

                // --- Adaptive Scaling ---
                let shrinkFactor = 1.0;
                if (attempt > maxAttempts * 0.8) shrinkFactor = 0.3;
                else if (attempt > maxAttempts * 0.6) shrinkFactor = 0.5;
                else if (attempt > maxAttempts * 0.3) shrinkFactor = 0.8;

                const baseScale = params.scale_min + Math.random() * (params.scale_max - params.scale_min);
                const scale = baseScale * shrinkFactor;
                const rotation = params.rotation_min + Math.random() * (params.rotation_max - params.rotation_min);

                const seedBbox = seed.bbox;
                // Use user-defined padding ratio
                const radius = (Math.max(seedBbox.width, seedBbox.height) / 2) * scale;
                const paddedRadius = radius * (1 + userPadding);

                const rx = bbox.left + Math.random() * bbox.width;
                const ry = bbox.top + Math.random() * bbox.height;

                // 1. Strict Multi-point Containment Check
                let inside = true;
                const pointsToTest = [{ x: rx, y: ry }];
                const checkRadius = paddedRadius; // Ensure padded area is inside
                for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
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

                        // Diversity: Avoid same seed too close
                        const diversityDist = (radius + p.radius) * 4;
                        if (p.seed_id === seed.id && distSq < diversityDist * diversityDist) {
                            neighborSameSeed = true;
                        }
                    }

                    if (!collision && (!neighborSameSeed || attempt > maxAttempts / 2)) {
                        const cx = seedBbox.left + seedBbox.width / 2;
                        const cy = seedBbox.top + seedBbox.height / 2;
                        const transform = `translate(${rx},${ry}) rotate(${rotation}) scale(${scale}) translate(${-cx},${-cy})`;

                        // Extract content properly
                        const contentMatcher = seed.thumbnail.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
                        const innerSvgContent = contentMatcher ? contentMatcher[1] : '';

                        placed.push({
                            x: rx,
                            y: ry,
                            radius: radius,
                            pRadius: paddedRadius,
                            seed_id: seed.id,
                            transform: transform,
                            svg: innerSvgContent
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%" style="background:#d1d1d1;">
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
            gap: parseFloat(formData.get('gap') || 4)
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

        // Calculate placement IF it's a preview OR if params changed
        if (isPreview || paramsJson !== currentParamsJson || currentPlacedObjects.length === 0) {
            console.log("Calculating new placement...");
            currentPlacedObjects = calculatePlacement(params);
            currentParamsJson = paramsJson;
        } else {
            console.log("Using cached preview placement for submission.");
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
        statusMessage.textContent = message;

        if (state === "error") {
            progressBar.classList.add('error');
            previewStatus.style.color = "var(--error-color)";
            previewStatus.textContent = "Error";
        } else {
            progressBar.classList.remove('error');
            previewStatus.style.color = "var(--success-color)";
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
});
