// Local launcher: every game asset is served from this folder, no CDN.
const BUILD_BASE = new URL("Build/", document.baseURI).href;
const DATA_BASE = new URL("data/", document.baseURI).href;
const BUILD_CONFIG_URL = BUILD_BASE + "fixed%20build.json";
const WASM_URL = BUILD_BASE + "fixed%20build.wasm";
const FRAMEWORK_URL = BUILD_BASE + "fixed%20build.wasm.framework.unityweb";
const MANUAL_URL = new URL("BombDefusalManual.pdf", document.baseURI).href;
const DATA_CHUNK_COUNT = 16;
const DATA_CHUNK_SIZE = 16 * 1024 * 1024;
const SKIP_INTRO_KEY = "ktane-manual-intro-skipped";

const loadingUi = document.getElementById("loading-ui");
const loadingBackdrop = document.getElementById("loading-backdrop");
const watermark = document.getElementById("watermark");
const watermarkVideo = document.getElementById("watermark-video");
const introCopy = document.getElementById("intro-copy");
const manualLink = document.getElementById("manual-link");
const continueButton = document.getElementById("continue-button");
const dontShowInput = document.getElementById("dont-show-input");
const loadingBar = document.getElementById("loading-bar");
const loadingProgress = document.getElementById("loading-progress");
const loadingPercent = document.getElementById("loading-percent");
const loadingStatus = document.getElementById("loading-status");

let unityProgress = 0;
let introShown = false;
let loadingFinished = false;
let loadingScreenRemoved = false;
let manualDownloadInProgress = false;

function setStatus(text) {
    loadingStatus.textContent = text;
    loadingStatus.title = text;
}

function updateLoadingProgress(progress) {
    unityProgress = Math.max(0, Math.min(1, progress));
    const percent = Math.round(unityProgress * 100);
    loadingProgress.style.width = percent + "%";
    loadingPercent.textContent = percent + "%";
    loadingBar.setAttribute("aria-valuenow", String(percent));
}

function shouldSkipIntro() {
    try {
        return window.localStorage.getItem(SKIP_INTRO_KEY) === "1";
    } catch (error) {
        return false;
    }
}

function rememberSkipIntro() {
    try {
        window.localStorage.setItem(SKIP_INTRO_KEY, "1");
    } catch (error) {
        // Private browsing can refuse storage; the prompt simply shows again.
    }
}

function placeIntroCopy() {
    // Center the whole composition: logo, gap and manual card together.
    // The logo stays at full size and only gives up width when the window
    // is genuinely too small to hold the composition.
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const copyHeight = introCopy.offsetHeight || 280;
    const gap = 10;
    const margin = 24;
    const videoLoaded = watermarkVideo.videoWidth > 0 && watermarkVideo.videoHeight > 0;
    const logoAspect = videoLoaded ? watermarkVideo.videoWidth / watermarkVideo.videoHeight : 1220 / 780;
    const availableForLogo = Math.max(120, viewportHeight - copyHeight - gap - margin * 2);
    const logoWidth = Math.max(160, Math.min(780, viewportWidth - 32, availableForLogo * logoAspect));
    document.body.style.setProperty("--intro-logo-width", logoWidth + "px");

    const logoHeight = videoLoaded
        ? logoWidth / logoAspect
        : (watermark.getBoundingClientRect().height || 94);
    // The video frame carries empty space under the logo; let the card rise
    // into that space so the text sits just under the visible mark.
    const contentBottomRatio = 0.759;
    const overlap = videoLoaded
        ? Math.max(0, Math.round(logoHeight * (1 - contentBottomRatio)) - 34)
        : 0;
    const spacing = videoLoaded ? -overlap : gap;
    const totalHeight = logoHeight + copyHeight + spacing;
    const groupTop = Math.max(margin, (viewportHeight - totalHeight) / 2);
    const logoCenter = groupTop + logoHeight / 2;
    const copyTop = Math.min(groupTop + logoHeight + spacing, viewportHeight - copyHeight - margin);
    document.body.style.setProperty("--intro-shift", (logoCenter - viewportHeight / 2) + "px");
    introCopy.style.top = copyTop + "px";
}

function revealIntroCopy() {
    if (!introShown || loadingScreenRemoved) {
        return;
    }
    // The logo must be settled before its lower edge can position the copy.
    placeIntroCopy();
    if (document.body.classList.contains("intro-copy-visible")) {
        return;
    }
    document.body.classList.add("intro-copy-visible");
    introCopy.setAttribute("aria-hidden", "false");
    continueButton.focus({ preventScroll: true });
}

function showIntro() {
    if (introShown || loadingScreenRemoved) {
        return;
    }
    introShown = true;
    updateLoadingProgress(1);
    placeIntroCopy();
    document.body.classList.add("intro-active");
    watermark.addEventListener("transitionend", function (event) {
        if (event.propertyName === "top" || event.propertyName === "transform") {
            revealIntroCopy();
        }
    });
    window.setTimeout(revealIntroCopy, 700);
}

function removeLoadingScreen() {
    if (loadingScreenRemoved) {
        return;
    }
    loadingScreenRemoved = true;
    watermarkVideo.pause();
    loadingUi.remove();
    loadingBackdrop.remove();
    watermark.remove();
}

function closeLoadingScreen() {
    if (loadingScreenRemoved) {
        return;
    }
    document.body.classList.add("intro-closing");
    introCopy.setAttribute("aria-hidden", "true");
    window.setTimeout(removeLoadingScreen, 600);
}

function finishLoading() {
    if (loadingFinished) {
        return;
    }
    loadingFinished = true;
    if (shouldSkipIntro()) {
        updateLoadingProgress(1);
        setStatus("starting game...");
        closeLoadingScreen();
    } else {
        setStatus("ready");
        showIntro();
    }
}

async function fetchDataChunk(index) {
    const name = "data-" + String(index).padStart(3, "0") + ".bin";
    const response = await fetch(DATA_BASE + name);
    if (!response.ok) {
        throw new Error("Unity data chunk request failed with HTTP " + response.status + ": " + name);
    }

    const chunk = await response.arrayBuffer();
    const isLastChunk = index === DATA_CHUNK_COUNT - 1;
    const sizeValid = isLastChunk
        ? chunk.byteLength > 0 && chunk.byteLength <= DATA_CHUNK_SIZE
        : chunk.byteLength === DATA_CHUNK_SIZE;
    if (!sizeValid) {
        throw new Error("Unity data chunk has an unexpected size: " + name + " (" + chunk.byteLength + " bytes)");
    }
    return chunk;
}

async function assembleUnityData() {
    let downloaded = 0;
    const chunks = await Promise.all(
        Array.from({ length: DATA_CHUNK_COUNT }, async function (_, index) {
            const chunk = await fetchDataChunk(index);
            downloaded += 1;
            setStatus("downloading game data (" + downloaded + "/" + DATA_CHUNK_COUNT + ")");
            return chunk;
        })
    );

    const signature = new TextDecoder().decode(new Uint8Array(chunks[0], 0, 15));
    if (signature !== "UnityWebData1.0") {
        throw new Error("Unity data chunks have an invalid archive header.");
    }

    return URL.createObjectURL(new Blob(chunks, { type: "application/octet-stream" }));
}

function loadUnityLoader() {
    return new Promise(function (resolve, reject) {
        const script = document.createElement("script");
        script.src = BUILD_BASE + "UnityLoader.js";
        script.onload = resolve;
        script.onerror = function () {
            reject(new Error("Unable to load " + script.src));
        };
        document.body.appendChild(script);
    });
}

async function startGame() {
    try {
        if (!window.UnityLoader || typeof window.UnityLoader.instantiate !== "function") {
            throw new Error("UnityLoader.instantiate is unavailable.");
        }

        setStatus("downloading build config...");
        const response = await fetch(BUILD_CONFIG_URL);
        if (!response.ok) {
            throw new Error("Game config request failed with HTTP " + response.status);
        }

        const config = await response.json();
        setStatus("downloading game data...");
        config.dataUrl = await assembleUnityData();
        config.wasmCodeUrl = WASM_URL;
        config.wasmFrameworkUrl = FRAMEWORK_URL;
        setStatus("starting unity...");

        const configUrl = URL.createObjectURL(
            new Blob([JSON.stringify(config)], { type: "application/json" })
        );
        window.UnityLoader.instantiate("unity-container", configUrl, {
            Module: {
                resolveBuildUrl: function (assetUrl) {
                    if (/^(https?|ftp|file):\/\//.test(assetUrl) || assetUrl.indexOf("blob:") === 0) {
                        return assetUrl;
                    }
                    if (/\.wasm(?:$|\?)/i.test(assetUrl)) {
                        return config.wasmCodeUrl;
                    }
                    return BUILD_BASE + assetUrl;
                },
                locateFile: function (fileName) {
                    if (/\.wasm(?:$|\?)/i.test(fileName)) {
                        return config.wasmCodeUrl;
                    }
                    return BUILD_BASE + fileName;
                }
            },
            onProgress: function (_gameInstance, progress) {
                updateLoadingProgress(progress);
                if (progress < 0.9) {
                    setStatus("downloading unity runtime...");
                } else if (progress < 1) {
                    setStatus("initializing webgl...");
                }
                if (progress >= 1) {
                    finishLoading();
                }
            },
            onerror: function (error) {
                setStatus("unable to load the game");
                console.error("Unity WebGL failed to load:", error);
            }
        });
    } catch (error) {
        setStatus("unable to load the game");
        console.error("Unable to load the game:", error);
    }
}

// The real logo is watermark.mp4; when it cannot be fetched, the plain
// "zay" wordmark takes its place and the intro plays the same way.
const videoFallbackTimer = window.setTimeout(function () {
    if (!watermarkVideo.videoWidth) {
        document.body.classList.add("video-missing");
    }
}, 4000);

watermarkVideo.addEventListener("loadeddata", function () {
    window.clearTimeout(videoFallbackTimer);
    document.body.classList.remove("video-missing");
});

watermarkVideo.addEventListener("error", function () {
    window.clearTimeout(videoFallbackTimer);
    document.body.classList.add("video-missing");
});

watermarkVideo.play().catch(function () {
    // Autoplay can be blocked; the first frame or the fallback still shows.
});

continueButton.addEventListener("click", function () {
    if (dontShowInput && dontShowInput.checked) {
        rememberSkipIntro();
    }
    closeLoadingScreen();
});

manualLink.addEventListener("click", async function (event) {
    event.preventDefault();
    if (manualDownloadInProgress) {
        return;
    }

    manualDownloadInProgress = true;
    manualLink.setAttribute("aria-disabled", "true");
    try {
        const response = await fetch(MANUAL_URL);
        if (!response.ok) {
            throw new Error("Manual download failed with HTTP " + response.status);
        }

        const pdf = await response.blob();
        if (pdf.size === 0 || (pdf.type && pdf.type !== "application/pdf")) {
            throw new Error("The manual file is invalid.");
        }

        const downloadUrl = URL.createObjectURL(pdf);
        const downloadLink = document.createElement("a");
        downloadLink.href = downloadUrl;
        downloadLink.download = "Bomb Defusal Manual.pdf";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        window.setTimeout(function () {
            URL.revokeObjectURL(downloadUrl);
        }, 60000);
    } catch (error) {
        console.error("Manual download failed:", error);
    } finally {
        manualDownloadInProgress = false;
        manualLink.removeAttribute("aria-disabled");
    }
});

window.addEventListener("resize", function () {
    if (introShown && !loadingScreenRemoved) {
        placeIntroCopy();
    }
});

window.requestAnimationFrame(function () {
    loadUnityLoader()
        .then(startGame)
        .catch(function (error) {
            setStatus("unity loader not found");
            console.error(error);
        });
});
