(function () {
    if (typeof AudioBufferSourceNode === "undefined") return;

    var originalStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
        var args = arguments;
        if ((args.length > 0 && !isFinite(when)) ||
            (args.length > 1 && !isFinite(offset)) ||
            (args.length > 2 && !isFinite(duration))) {
            console.warn("Skipped Web Audio playback with non-finite timing.");
            return;
        }

        return originalStart.apply(this, args);
    };
})();
