from playwright.sync_api import sync_playwright
from pathlib import Path
p=Path('/mnt/data/CCLX_Economic_Lab_Standalone.html')
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--no-proxy-server'])
    page=browser.new_page(viewport={'width':393,'height':851},device_scale_factor=2,is_mobile=True,has_touch=True)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://cclx.test/**',lambda route:route.fulfill(status=200,body=p.read_bytes(),content_type='text/html'))
    page.goto('https://cclx.test/',wait_until='domcontentloaded')
    page.locator('h1').wait_for(timeout=15000)
    print('Rendered:',page.locator('h1').inner_text())
    print('Initial errors:',errors)
    page.locator('[data-action="menu"]').click()
    for name in ['mock','liquidity','funding','stress','exploits','calibration','assumptions']:
        page.locator('[data-nav="'+name+'"]').click()
        print('View',name,page.locator('h1').inner_text())
        assert 'Render error' not in page.locator('body').inner_text()
        if name!='assumptions':page.locator('[data-action="menu"]').click()
    page.locator('[data-action="menu"]').click()
    page.locator('[data-nav="stress"]').click()
    page.locator('[data-config="stress.paths"]').fill('8')
    page.locator('[data-config="stress.paths"]').dispatch_event('change')
    page.locator('[data-config="stress.months"]').fill('12')
    page.locator('[data-config="stress.months"]').dispatch_event('change')
    page.locator('[data-action="run-stress"]').first.click()
    page.get_by_text('Monthly stress heatmap').wait_for(timeout=60000)
    print('Financial Simulation completed successfully')
    assert not errors,errors
    width=page.evaluate('document.documentElement.scrollWidth')
    print('Viewport:',page.evaluate('window.innerWidth'),'document width:',width)
    assert width<=page.evaluate('window.innerWidth')+2
    page.screenshot(path='/mnt/data/cclx-lab/screenshots/standalone-mobile.png',full_page=True)
    browser.close()
