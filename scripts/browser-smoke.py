import json, os, time, urllib.request, mimetypes
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('CCLX_TEST_URL','http://127.0.0.1:3000')
LOCAL='http://127.0.0.1:3000'
shots=ROOT/'screenshots';shots.mkdir(exist_ok=True)
report={'url':URL,'checks':[],'consoleErrors':[],'pageErrors':[]}
def assert_viewport(page):
    width=page.evaluate('document.documentElement.scrollWidth'); viewport=page.evaluate('window.innerWidth')
    assert width<=viewport+2,(width,viewport)
def local_route(route):
    url=route.request.url
    if not url.startswith(URL):
        route.abort();return
    with urllib.request.urlopen(LOCAL+url[len(URL):],timeout=10) as response:
        route.fulfill(status=response.status,body=response.read(),headers={'Content-Type':response.headers.get('Content-Type','application/octet-stream'),'Access-Control-Allow-Origin':'*'})
def check(name,fn):
    fn();report['checks'].append({'name':name,'status':'pass'})
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--no-proxy-server','--proxy-bypass-list=*'])
    ctx=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
    ctx.route('**/*',local_route)
    page=ctx.new_page();page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
    page.on('console',lambda m:report['consoleErrors'].append(m.text) if m.type=='error' else None)
    page.goto(URL,wait_until='networkidle');page.locator('h1').wait_for()
    check('Overview renders',lambda: page.get_by_text('A product prototype and a quantitative lab').wait_for())
    page.screenshot(path=str(shots/'desktop-overview.png'),full_page=True)
    def nav(name):
        page.locator('[data-nav="'+name+'"]').click()
        page.locator('h1').wait_for()
        assert page.locator('h1').count()==1
        assert 'Render error' not in page.locator('body').inner_text()
    for name in ['mock','liquidity','funding','stress','exploits','calibration','assumptions']:
        check('Navigation '+name,lambda n=name:nav(n))
    nav('mock')
    page.locator('#mock-amount').fill('1000')
    page.locator('[data-action="mock-trade"]').click()
    check('Mock purchase',lambda:page.get_by_text('Mock transaction completed.').wait_for())
    page.locator('#pool-amount').fill('1000')
    page.locator('[data-action="mock-allocate"]').click()
    check('Pool deposit',lambda:page.get_by_text('Open positions').wait_for())
    page.locator('[data-action="advance-30"]').click();page.locator('[data-action="mock-claim"]').click()
    check('Accrual and claim',lambda:page.get_by_text('Cumulative rewards emitted').wait_for())
    page.screenshot(path=str(shots/'desktop-mock.png'),full_page=True)
    page.locator('[data-mock-side="convert"]').click()
    page.locator('#mock-amount').fill('75000')
    page.locator('[data-action="mock-trade"]').click()
    check('Legacy conversion',lambda:page.get_by_text('Restricted, vesting').wait_for())
    nav('liquidity');check('Liquidity depth audit',lambda:page.get_by_text('Launch configuration').wait_for())
    page.screenshot(path=str(shots/'desktop-liquidity.png'),full_page=True)
    nav('funding');check('Funding and vesting tables',lambda:page.get_by_text('Round pricing and valuation').wait_for())
    page.screenshot(path=str(shots/'desktop-funding.png'),full_page=True)
    nav('exploits');page.locator('[data-action="run-attacks"]').click()
    check('Adversarial suite',lambda:page.get_by_text('Model-level attack suite').wait_for())
    assert page.get_by_text('15',exact=True).count()>=1
    nav('stress')
    page.locator('[data-config="stress.paths"]').fill('8');page.locator('[data-config="stress.paths"]').dispatch_event('change')
    page.locator('[data-config="stress.months"]').fill('12');page.locator('[data-config="stress.months"]').dispatch_event('change')
    page.locator('[data-action="run-stress"]').first.click()
    page.get_by_text('Latest simulation results').wait_for(timeout=90000)
    check('Financial Simulation worker completes',lambda:page.get_by_text('Monthly stress heatmap').wait_for())
    page.screenshot(path=str(shots/'desktop-stress.png'),full_page=True)
    nav('calibration');page.locator('#orderbook-text').fill('side,price,quantity,venue\nbid,0.274,100000,Demo\nask,0.276,100000,Demo')
    page.locator('[data-action="analyze-csv"]').click()
    check('CSV snapshot calibration',lambda:page.get_by_text('Imported snapshot analysis').wait_for())
    nav('assumptions');page.locator('#config-json').fill('{bad json')
    page.locator('[data-action="apply-json"]').click()
    check('Invalid JSON rejected',lambda:page.locator('#toast.error').wait_for())
    ctx.close()
    mobile=browser.new_context(viewport={'width':393,'height':851},device_scale_factor=2.75,is_mobile=True,has_touch=True)
    mobile.route('**/*',local_route)
    pg=mobile.new_page();pg.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
    pg.on('console',lambda m:report['consoleErrors'].append(m.text) if m.type=='error' else None)
    pg.goto(URL,wait_until='networkidle');pg.locator('h1').wait_for()
    pg.screenshot(path=str(shots/'mobile-overview.png'),full_page=True)
    check('Mobile viewport',lambda:assert_viewport(pg))
    pg.locator('[data-action="menu"]').click();pg.locator('[data-nav="mock"]').click()
    check('Mobile navigation',lambda:pg.get_by_text('CLX Lab').wait_for())
    pg.screenshot(path=str(shots/'mobile-mock.png'),full_page=True)
    pg.locator('[data-action="menu"]').click();pg.locator('[data-nav="stress"]').click()
    pg.locator('[data-config="stress.paths"]').fill('4');pg.locator('[data-config="stress.paths"]').dispatch_event('change')
    pg.locator('[data-config="stress.months"]').fill('6');pg.locator('[data-config="stress.months"]').dispatch_event('change')
    pg.locator('[data-action="run-stress"]').first.click()
    pg.get_by_text('Latest simulation results').wait_for(timeout=90000)
    check('Mobile Financial Simulation worker',lambda:pg.get_by_text('Monthly stress heatmap').wait_for())
    pg.screenshot(path=str(shots/'mobile-stress.png'),full_page=True)
    mobile.close();browser.close()
report['passed']=len(report['checks']);report['failed']=len(report['pageErrors'])+len(report['consoleErrors'])
(ROOT/'browser-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
if report['failed']:raise SystemExit(1)
