const NMFParser = {
    parse(content) {
        const lines = content.split(/\r?\n/);
        let allPoints = []; // Renamed to avoid confusion
        let currentGPS = null;
        let currentLAC = 'N/A';
        let currentCellID = 'N/A';

        const uniqueHeaders = new Set();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(',');
            const header = parts[0];
            uniqueHeaders.add(header);

            if (header.startsWith('#')) continue;

            if (header === 'CHI') {
                // CHI,...,CellID,LAC,...
                if (parts.length > 10) {
                    const lac = parseInt(parts[10]);
                    if (!isNaN(lac)) currentLAC = lac;
                    const cid = parseInt(parts[8]);
                    if (!isNaN(cid)) currentCellID = cid;
                }
            } else if (header === 'GPS') {
                if (parts.length > 4) {
                    const lat = parseFloat(parts[4]);
                    const lng = parseFloat(parts[3]);
                    const alt = parseFloat(parts[5]);
                    const speed = parseFloat(parts[8]);

                    if (!isNaN(lat) && !isNaN(lng)) {
                        currentGPS = { lat, lng, alt, speed };
                    }
                }
            } else if (header === 'CELLMEAS') {
                if (!currentGPS) continue;

                const techId = parseInt(parts[3]);
                let servingFreq = 0;
                let servingLevel = -999;
                let servingBand = 'Unknown';
                let servingSc = null;
                let servingEcNo = null;

                let neighbors = [];
                let nBlockSize = 18;
                let nStartIndex = 14;

                let n1_rscp, n1_ecno, n1_sc;
                let n2_rscp, n2_ecno, n2_sc;
                let n3_rscp, n3_ecno, n3_sc;

                if (techId === 5) {
                    // UMTS
                    servingFreq = parseFloat(parts[7]);
                    servingLevel = parseFloat(parts[8]);

                    if (servingFreq >= 10562 && servingFreq <= 10838) servingBand = 'B1 (2100)';
                    else if (servingFreq >= 2937 && servingFreq <= 3088) servingBand = 'B8 (900)';
                    else if (servingFreq > 10000) servingBand = 'High Band';
                    else if (servingFreq < 4000) servingBand = 'Low Band';

                    nStartIndex = 14;
                    nBlockSize = 17;
                    for (let j = nStartIndex; j < parts.length; j += nBlockSize) {
                        if (j + 4 >= parts.length) break;
                        const nFreq = parseFloat(parts[j]);
                        const nPci = parseInt(parts[j + 1]);
                        const nEcNo = parseFloat(parts[j + 2]);
                        const nRscp = parseFloat(parts[j + 4]);

                        if (!isNaN(nFreq) && !isNaN(nPci)) {
                            neighbors.push({ freq: nFreq, pci: nPci, ecno: nEcNo, rscp: nRscp });
                            if (Math.abs(nFreq - servingFreq) < 1 && servingSc === null) {
                                servingSc = nPci;
                                servingEcNo = nEcNo;
                            }
                        }
                    }
                    if (neighbors.length > 0 && n1_rscp === undefined) {
                        // Fallback N1 logic will be handled below
                    }
                } else if (techId === 1 || techId === 2) {
                    if (parts.length > 11) {
                        servingFreq = parseFloat(parts[8]);
                        servingLevel = parseFloat(parts[11]);
                    }
                } else {
                    servingFreq = parseFloat(parts[7]);
                    servingLevel = parseFloat(parts[8]);
                }

                if (servingLevel > -20 && servingLevel !== -999) {
                    if (servingLevel > 0) servingLevel = NaN;
                }

                if (servingLevel === -999 || isNaN(servingLevel)) {
                    continue;
                }

                neighbors.sort((a, b) => b.rscp - a.rscp);

                if (neighbors.length > 0) {
                    // Check if Serving SC was found
                    if (servingSc !== null) {
                        // Filter out the serving cell from neighbors to avoid A1 == A2
                        neighbors = neighbors.filter(n => n.pci !== servingSc);
                    }

                    // Re-sort after filtering (just in case)
                    neighbors.sort((a, b) => b.rscp - a.rscp);
                }

                if (neighbors.length > 0) {
                    n1_sc = neighbors[0].pci;
                    n1_rscp = neighbors[0].rscp;
                    n1_ecno = neighbors[0].ecno;
                }
                if (neighbors.length > 1) {
                    n2_sc = neighbors[1].pci;
                    n2_rscp = neighbors[1].rscp;
                    n2_ecno = neighbors[1].ecno;
                }
                if (neighbors.length > 2) {
                    n3_sc = neighbors[2].pci;
                    n3_rscp = neighbors[2].rscp;
                    n3_ecno = neighbors[2].ecno;
                }

                const cellData = {
                    serving: {
                        freq: servingFreq,
                        level: servingLevel,
                        band: servingBand,
                        sc: servingSc,
                        ecno: servingEcNo,
                        lac: currentLAC,
                        cellId: currentCellID
                    },
                    neighbors: neighbors
                };

                const point = {
                    lat: currentGPS.lat,
                    lng: currentGPS.lng,
                    time: parts[1],
                    type: 'MEASUREMENT', // Standardize type
                    level: servingLevel,
                    ecno: servingEcNo,
                    sc: servingSc,
                    freq: servingFreq,
                    cellId: currentCellID,
                    lac: currentLAC,
                    active_set: (() => {
                        let aset = [];
                        // 1. Identify Candidates (Serving + Neighbors in Window)
                        // Note: servingLevel is RSCP for 3G
                        const windowSize = 6;
                        let candidates = [];

                        if (servingSc !== null && servingLevel !== -999 && !isNaN(servingLevel)) {
                            candidates.push({ pci: servingSc, rscp: servingLevel, type: 'S' });
                        }

                        neighbors.forEach(n => {
                            if (Math.abs(n.freq - servingFreq) < 1) { // Only intra-freq
                                if (n.rscp >= servingLevel - windowSize) {
                                    // Avoid duplicates (if neighbor is serving, though parser filters that usually)
                                    if (!candidates.some(c => c.pci === n.pci)) {
                                        candidates.push({ pci: n.pci, rscp: n.rscp, type: 'N' });
                                    }
                                }
                            }
                        });

                        // 2. Sort by RSCP Descending
                        candidates.sort((a, b) => b.rscp - a.rscp);

                        // 3. Extract SCs for the string representation
                        aset = candidates.map(c => c.pci);

                        return aset.join(', ');
                    })(),
                    // A1..A3 Metrics (Sorted Active Set)
                    get a1_sc() {
                        const parts = this.active_set.split(', ');
                        return parts.length > 0 && parts[0] !== '' ? parseInt(parts[0]) : null;
                    },
                    get a1_rscp() {
                        const sc = this.a1_sc;
                        if (sc === null) return null;
                        if (this.sc === sc) return this.level; // Serving
                        // Check neighbors
                        const n = this.parsed.neighbors.find(x => x.pci === sc);
                        return n ? n.rscp : null;
                    },
                    get a2_sc() {
                        const parts = this.active_set.split(', ');
                        return parts.length > 1 ? parseInt(parts[1]) : null;
                    },
                    get a2_rscp() {
                        const sc = this.a2_sc;
                        if (sc === null) return null;
                        if (this.sc === sc) return this.level;
                        const n = this.parsed.neighbors.find(x => x.pci === sc);
                        return n ? n.rscp : null;
                    },
                    get a3_sc() {
                        const parts = this.active_set.split(', ');
                        return parts.length > 2 ? parseInt(parts[2]) : null;
                    },
                    get a3_rscp() {
                        const sc = this.a3_sc;
                        if (sc === null) return null;
                        if (this.sc === sc) return this.level;
                        const n = this.parsed.neighbors.find(x => x.pci === sc);
                        return n ? n.rscp : null;
                    },
                    n1_sc, n1_rscp, n1_ecno,
                    n2_sc, n2_rscp, n2_ecno,
                    n3_sc, n3_rscp, n3_ecno,
                    details: line,
                    parsed: cellData
                };

                allPoints.push(point);

            } else if (header.toUpperCase().includes('RRC') || header.toUpperCase().includes('L3') || header.toUpperCase().includes('NAS')) {
                const time = parts[1];
                let direction = '-';
                let message = 'Unknown'; // Initialize message
                let payload = 'N/A'; // Initialize payload

                // Improved Heuristic: Search for the "best" candidate for a message name across ALL parts.
                // We want the longest string that contains letters and is not a common keyword.

                let longestCandidate = '';
                // let bestIndex = -1; // Unused

                for (let k = 2; k < parts.length; k++) {
                    const p = parts[k].trim().replace(/"/g, '');
                    // Skip numeric, empty, or short strings
                    if (!p || p.length < 3 || /^\d+$/.test(p)) continue;

                    // Skip common keywords
                    const up = p.toUpperCase();
                    if (['UL', 'DL', 'UPLINK', 'DOWNLINK', 'UMTS', 'LTE', 'GSM', 'WCDMA'].includes(up)) {
                        if (['UL', 'DL', 'UPLINK', 'DOWNLINK'].includes(up)) direction = p;
                        continue;
                    }

                    // HEX FILTER: If string is purely Hex characters (0-9, A-F), it's likely a raw payload dump.
                    // A valid message name usually contains letters G-Z (e.g. "REQUEST", "Master") or underscores.
                    // Exception: Short hex words could be names, but usually > 8 chars hex is payload.
                    if (/^[0-9A-Fa-f]+$/.test(p) && p.length > 6) {
                        payload = p; // Capture it!
                        continue;
                    }

                    // Prefer strings with underscores (very strong signal for a message name)
                    const hasUnderscore = p.includes('_');
                    const currentHasUnderscore = longestCandidate.includes('_');

                    // If current candidate has underscore and new one doesn't, keep current (unless new is much longer?)
                    // Actually, underscore is a better indicator than length for things like "MEASUREMENT_REPORT" vs "SomeLongGarbageString".

                    if (hasUnderscore && !currentHasUnderscore) {
                        longestCandidate = p;
                    } else if (!hasUnderscore && currentHasUnderscore) {
                        // Keep existing
                    } else {
                        // Both have underscore, or neither. Use length.
                        if (p.length > longestCandidate.length) {
                            longestCandidate = p;
                        }
                    }
                }

                if (longestCandidate) {
                    message = longestCandidate;
                }

                // Debug log for the first few lines to help us see the format
                if (allPoints.filter(p => p.type === 'SIGNALING').length < 3) {
                    console.log('DEBUG SIGNALING LINE:', line);
                    console.log('Parsed Message:', message);
                }

                if (message) message = message.replace(/"/g, '');

                allPoints.push({
                    lat: currentGPS ? currentGPS.lat : null,
                    lng: currentGPS ? currentGPS.lng : null,
                    time: time,
                    type: 'SIGNALING',
                    category: (header.toUpperCase().includes('L3') || header.toUpperCase().includes('NAS')) ? 'L3' : 'RRC',
                    direction: direction,
                    message: message,
                    payload: payload,
                    details: line
                });
            }
        }

        console.log('--- NMF PARSER DEBUG ---');
        console.log('Unique Event Headers Found:', Array.from(uniqueHeaders));
        console.log('Signaling Points Found:', allPoints.filter(p => p.type === 'SIGNALING').length);
        console.log('------------------------');

        // Split points
        const measurementPoints = allPoints.filter(p => p.type === 'MEASUREMENT');
        const signalingPoints = allPoints.filter(p => p.type === 'SIGNALING');

        // Detect Technology based on measurements
        let detectedTech = 'Unknown';
        if (measurementPoints.length > 0) {
            const sample = measurementPoints.slice(0, 50);
            const freqs = sample.map(p => p.parsed && p.parsed.serving ? parseFloat(p.parsed.serving.freq) : NaN).filter(f => !isNaN(f));
            const is3G = freqs.some(f => (f >= 10500 && f <= 10900) || (f >= 2900 && f <= 3100) || (f >= 4300 && f <= 4500));
            if (is3G) {
                detectedTech = '3G (UMTS)';
            } else {
                const avgFreq = freqs.reduce((a, b) => a + b, 0) / freqs.length;
                if (avgFreq < 1000) detectedTech = '2G (GSM)';
                else if (avgFreq > 120000) detectedTech = '5G (NR)';
                else detectedTech = '4G (LTE)';
            }
            if (freqs.includes(10788)) detectedTech = '3G (WCDMA)';
        }

        return {
            points: measurementPoints,
            signaling: signalingPoints,
            tech: detectedTech
        };
    }
};
