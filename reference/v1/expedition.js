/* Persistent narrative: progress comes from cleared waves, across every flight. */
(() => {
    const chapters = [
        ['01 / THE LAST LIGHT', 'Mission control · outbound', 'Forty years ago, the research ship Orison vanished beyond Neptune. Tonight, its distress beacon returned. You are the only pilot close enough to answer. Clear the belt. Find the source. Bring someone home.'],
        ['02 / AN IMPOSSIBLE VOICE', 'Orison recording · fragment recovered', '“Do not follow the beacon.” The voice is yours. The recording is dated forty years before your birth. Beneath the words: a second pulse, too regular to be static. Your navigator, MICA, begins counting.'],
        ['03 / THE GARDEN', 'MICA · biological scan', 'These creatures are not an invasion. They grow around the signal like roots around water. Orison found something living inside the ice. Its last survey names it a garden. Every weapons discharge makes the beacon louder.'],
        ['04 / THE PASSENGERS', 'Orison manifest · decrypted', 'There were no people aboard Orison. There were twelve thousand sleeping memories: the last archive of a lost colony. The garden has been keeping them alive. The distress signal is a request for a carrier.'],
        ['05 / THE OTHER PILOT', 'Private channel · identity confirmed', 'The voice is the person your flight model was trained on. Your mother. She never flew Orison; she gave it her memories. “If someone comes,” she says, “tell them I remembered the sea.” MICA stops counting.'],
        ['06 / A WAY THROUGH', 'MICA · carrier solution', 'The creatures are defending the archive from the machines that harvest it. Their attacks follow an old quarantine protocol. MICA finds a gap: your phase drive can carry the sleeping voices through. Keep the ship alive. We are almost within range.'],
        ['07 / TWELVE THOUSAND DAWNS', 'Archive transfer · complete', 'For one impossible second, the cockpit smells of rain. Twelve thousand memories settle into the ship. The beacon goes dark. Your mother’s voice says, “Thank you for coming.” Ahead, the belt opens. Behind you, the garden keeps growing.'],
        ['08 / THE LONG WAY HOME', 'New mission · the return journey', 'MICA marks a course toward the Sun. You are no longer flying alone. Each new passage through the belt maps a safer route for the ships that will follow. The rescue is complete. The journey home belongs to you.']
    ];
    let cleared = 0;
    try { cleared = Math.max(0, Math.min(1000000, Number(localStorage.getItem('kuiper_archive_waves')) || 0)); } catch (_) {}
    let hooks = {}, modal, toast, status, dossier, lastState, lastLayout, lastProgress = -1, toastUntil = 0;
    const unlocked = () => Math.min(chapters.length, 1 + Math.floor(cleared / 2));
    function mount() {
        if (modal) return;
        modal = document.createElement('dialog');
        modal.className = 'archive-dialog';
        modal.setAttribute('aria-labelledby', 'archive-title');
        modal.innerHTML = '<div class="archive-top"><span>ORISON / RECOVERED TRANSMISSIONS</span><button type="button" class="archive-close" aria-label="Close flight log">✕</button></div><h1 id="archive-title">The signal remembers.</h1><p class="archive-intro">A story recovered in flight. Clear two waves to decode the next transmission. Progress survives every run.</p><div class="archive-progress"></div><div class="archive-entries"></div>';
        document.body.appendChild(modal);
        modal.querySelector('button').onclick = () => modal.close();
        modal.addEventListener('click', event => { if (event.target === modal) { const r=modal.getBoundingClientRect(); if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) modal.close(); } });
        // Escape belongs to the dialog; it must not also resume the flight beneath it.
        modal.addEventListener('keydown', event => event.stopPropagation());
        toast = document.createElement('div');
        toast.className = 'archive-toast';
        toast.setAttribute('role', 'status');
        document.body.appendChild(toast);
        status = document.createElement('div');
        status.className = 'archive-status';
        document.body.appendChild(status);
        dossier = document.createElement('aside');
        dossier.className = 'archive-dossier';
        dossier.innerHTML = '<span class="dossier-label">INCOMING / ORISON</span><h2></h2><p></p><div class="dossier-track"></div><small></small><button type="button">Open flight log ↗</button>';
        dossier.querySelector('button').onclick = () => window.expedition.open();
        document.body.appendChild(dossier);
    }
    function renderLog() {
        modal.querySelector('.archive-progress').textContent = `${unlocked()} / ${chapters.length} TRANSMISSIONS DECODED · ${cleared} WAVES CLEARED`;
        const list = modal.querySelector('.archive-entries');
        list.replaceChildren();
        chapters.forEach(([title, source, body], i) => {
            const entry = document.createElement('article');
            entry.className = i < unlocked() ? 'archive-entry' : 'archive-entry locked';
            const heading = document.createElement('h2');
            heading.textContent = i < unlocked() ? title : `${String(i + 1).padStart(2, '0')} / ENCRYPTED`;
            const label = document.createElement('small');
            label.textContent = i < unlocked() ? source : `${i * 2 - cleared} more cleared waves to recover`;
            entry.append(heading, label);
            if (i < unlocked()) { const p = document.createElement('p'); p.textContent = body; entry.append(p); }
            list.append(entry);
        });
    }
    window.expedition = {
        isOpen() { return !!modal?.open; },
        configure(callbacks) { hooks = callbacks; },
        open() { mount(); hooks.pause?.(); renderLog(); if (!modal.open) modal.showModal(); },
        onRunStart() { mount(); toastUntil = performance.now() + 5500; toast.textContent = unlocked() === chapters.length ? 'ARCHIVE SAFE / Map the way home.' : `MISSION / Clear ${2 - cleared % 2} waves to recover the next transmission.`; },
        onWaveComplete() {
            const before = unlocked();
            cleared++;
            try { localStorage.setItem('kuiper_archive_waves', String(cleared)); } catch (_) {}
            mount();
            toastUntil = performance.now() + 5000;
            toast.textContent = unlocked() > before ? `TRANSMISSION ${String(unlocked()).padStart(2, '0')} RECOVERED / Read your flight log during a breather.` : unlocked() < chapters.length ? 'SIGNAL STRENGTH RISING / One more cleared wave to decode.' : 'RETURN ROUTE MAPPED / Another passage made safe.';
        },
        sync(game) {
            mount();
            const layout = `${innerWidth}/${innerHeight}`;
            if (layout !== lastLayout) {
                lastLayout = layout;
                const rect = document.getElementById('gameCanvas').getBoundingClientRect();
                const side = innerHeight < 480 && rect.left > 200;
                toast.style.width = `${side ? Math.min(240, rect.left - 32) : Math.min(320, rect.width - 24)}px`;
                toast.style.left = `${side ? rect.left / 2 : rect.left + rect.width / 2}px`;
                toast.style.top = `${side ? Math.max(20, innerHeight / 2 - 45) : rect.top >= 70 ? 8 : rect.top + rect.height * .105}px`;
            }
            toast.hidden = performance.now() > toastUntil || game.state !== 'playing';
            if (lastState !== game.state) {
                lastState = game.state;
                status.hidden = !['start', 'game_over'].includes(game.state);
            }
            status.textContent = `ORISON ARCHIVE · ${unlocked()}/${chapters.length} SIGNALS RECOVERED`;
            if (lastProgress !== cleared) {
                lastProgress = cleared;
                const chapter = chapters[unlocked() - 1];
                dossier.querySelector('h2').textContent = chapter[0].split(' / ')[1];
                dossier.querySelector('p').textContent = chapter[2];
                dossier.querySelector('small').textContent = unlocked() === chapters.length ? 'ARCHIVE COMPLETE / COURSE SET FOR HOME' : `${2 - cleared % 2} CLEARED WAVES TO NEXT SIGNAL`;
                const track = dossier.querySelector('.dossier-track');
                track.replaceChildren();
                chapters.forEach((_, i) => { const pip=document.createElement('span'); pip.className=i < unlocked() ? 'decoded' : ''; track.append(pip); });
            }
        },
        getProgress() { return { cleared, unlocked: unlocked(), total: chapters.length }; }
    };
})();
