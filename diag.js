// DIAGNOSTIC - shows page structure
(function() {
  var out = [];
  out.push('URL: ' + location.href);
  out.push('Title: ' + document.title);

  // Videos
  var vids = document.querySelectorAll('video');
  out.push('Video tags: ' + vids.length);
  vids.forEach(function(v,i) {
    out.push('  Video['+i+'] src=' + (v.src||'none').substring(0,80));
    out.push('  Video['+i+'] sources=' + v.querySelectorAll('source').length);
    out.push('  Video['+i+'] size=' + v.offsetWidth + 'x' + v.offsetHeight);
  });

  // Iframes
  var ifs = document.querySelectorAll('iframe');
  out.push('Iframes: ' + ifs.length);
  ifs.forEach(function(f,i) {
    out.push('  Iframe['+i+'] src=' + (f.src||'none').substring(0,80));
  });

  // Links to fsresource
  var links = document.querySelectorAll('a[href*="fsresource"]');
  out.push('fsresource links: ' + links.length);

  // Show result
  var div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;' +
    'background:#000;color:#0f0;font:14px monospace;padding:20px;overflow:auto;white-space:pre-wrap;';
  div.textContent = out.join('\n');
  document.body.appendChild(div);
  console.log(out.join('\n'));
})();
