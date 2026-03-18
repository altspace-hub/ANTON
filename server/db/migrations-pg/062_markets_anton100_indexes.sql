-- Migration 062 (PG): Markets Pillar — ANTON 100 Indexes with Real Ticker Universes
-- Updates existing seed indexes with real tickers and inserts 4 new regional indexes.
-- Each index has a $100M fictional budget and 100-ticker universe.
-- PostgreSQL version: uses ON CONFLICT DO NOTHING instead of INSERT OR IGNORE.

-- ── Update existing US 100 index with real S&P 500 top 100 tickers ──────────

UPDATE market_indexes SET
  universe = '["AAPL","MSFT","AMZN","NVDA","GOOGL","META","BRK.B","UNH","LLY","JPM","XOM","V","JNJ","PG","MA","AVGO","HD","COST","MRK","ABBV","CVX","PEP","KO","WMT","BAC","ADBE","CRM","MCD","CSCO","TMO","NFLX","ACN","AMD","LIN","ABT","INTC","DHR","INTU","TXN","PM","CMCSA","AMGN","HON","UPS","NEE","RTX","LOW","ELV","QCOM","CAT","BA","GE","IBM","PFE","DE","AXP","MS","GS","ISRG","BLK","SBUX","MDT","GILD","SYK","BKNG","SPGI","ADI","MDLZ","MMC","CI","REGN","TJX","CB","PLD","VRTX","ADP","TMUS","SO","ZTS","SCHW","BDX","MO","DUK","CME","CL","APD","ICE","NOC","SHW","AON","FDX","MCK","ITW","EMR","ECL","NSC","WM","HUM","PNC","TROW"]',
  budget = 100000000,
  currency = 'USD',
  description = 'ANTON US 100 — Top 100 US large-cap equities by market cap. $100M fictional budget, equal-weight, monthly rebalance vs SPY benchmark.'
WHERE id = 'midx_seed_us100';

-- ── Update existing Nordic 30 index with real OMX tickers ───────────────────

UPDATE market_indexes SET
  universe = '["VOLV-B.ST","ASSA-B.ST","ATCO-A.ST","AZN.ST","ERIC-B.ST","ESSITY-B.ST","EVO.ST","HEXA-B.ST","HM-B.ST","HUSQ-B.ST","INVE-B.ST","KINV-B.ST","SCA-B.ST","SEB-A.ST","SHB-A.ST","SKF-B.ST","SSAB-A.ST","SWED-A.ST","TEL2-B.ST","TELIA.ST","SAND.ST","ALFA.ST","NDA-SE.ST","NIBE-B.ST","SAAB-B.ST","NOVO-B.CO","DSV.CO","MAERSK-B.CO","CARL-B.CO","ORSTED.CO"]',
  budget = 100000000,
  currency = 'SEK',
  description = 'ANTON Nordic 30 — 30 highest-conviction Nordic companies across Sweden, Denmark. $100M SEK budget, conviction weighting, quarterly rebalance vs OMXS30.'
WHERE id = 'midx_seed_nordic30';

-- ── ANTON Sweden 100 ────────────────────────────────────────────────────────

INSERT INTO market_indexes (id, name, description, index_type, philosophy, universe, max_holdings, rebalance_frequency, weighting_method, benchmark_symbol, status, budget, currency)
VALUES (
  'midx_seed_sweden100',
  'ANTON Sweden 100',
  'ANTON Sweden 100 — Top 100 OMX Stockholm Large/Mid Cap equities. 100M SEK fictional budget, equal-weight, monthly rebalance vs OMXS30.',
  'geographic',
  'Swedish market breadth with equal-weight discipline',
  '["VOLV-B.ST","ASSA-B.ST","ATCO-A.ST","AZN.ST","ERIC-B.ST","ESSITY-B.ST","EVO.ST","HEXA-B.ST","HM-B.ST","HUSQ-B.ST","INVE-B.ST","KINV-B.ST","SCA-B.ST","SEB-A.ST","SHB-A.ST","SKF-B.ST","SSAB-A.ST","SWED-A.ST","TEL2-B.ST","TELIA.ST","SAND.ST","ALFA.ST","BILL.ST","BOL.ST","ELUX-B.ST","GETI-B.ST","LUND-B.ST","NDA-SE.ST","NIBE-B.ST","SAAB-B.ST","SINCH.ST","SOBI.ST","SWEC-B.ST","WIHL.ST","AFRY.ST","ADDN-B.ST","AXFO.ST","BALD-B.ST","BEIA-B.ST","BUFAB.ST","CAST.ST","CLAS-B.ST","DIOS.ST","DUST.ST","EKTA-B.ST","EPRO-B.ST","FABG.ST","HPOL-B.ST","HUFV-A.ST","INSTAL.ST","INWI.ST","JM.ST","KCAP.ST","KNOW.ST","LAGR-B.ST","LIFCO-B.ST","LATO-B.ST","LIME.ST","LOOM-B.ST","LUNE.ST","MEDA.ST","MIPS.ST","MTRS.ST","NENT-B.ST","NOLA-B.ST","NOBI.ST","OEM-B.ST","PEAB-B.ST","RATO-B.ST","RESA.ST","SAGA-B.ST","SAVE.ST","SECT-B.ST","SECU-B.ST","SIVE.ST","SKEL.ST","SSAB-B.ST","STOR-B.ST","SVOL-B.ST","SYSR.ST","THULE.ST","TREL-B.ST","TROAX.ST","VITR.ST","WALL-B.ST","WBIL.ST","XANO-B.ST","AAK.ST","CALTX.ST","HLDX.ST","MYCR.ST","BINV.ST","COOR.ST","HEMF.ST","STE-R.ST","VOLO.ST","COIC.ST","BOOZT.ST","VPLAY-B.ST","BETS-B.ST","ARION.ST"]',
  100,
  'monthly',
  'equal',
  'OMXS30',
  'draft',
  100000000,
  'SEK'
) ON CONFLICT DO NOTHING;

-- ── ANTON EU 100 ────────────────────────────────────────────────────────────

INSERT INTO market_indexes (id, name, description, index_type, philosophy, universe, max_holdings, rebalance_frequency, weighting_method, benchmark_symbol, status, budget, currency)
VALUES (
  'midx_seed_eu100',
  'ANTON EU 100',
  'ANTON EU 100 — Top 100 European equities from STOXX 600. 100M EUR budget, equal-weight, monthly rebalance vs STOXX50E.',
  'geographic',
  'European market breadth across major exchanges',
  '["ASML.AS","MC.PA","NESN.SW","NOVO-B.CO","SAP.DE","OR.PA","SHEL.L","AZN.L","SIE.DE","TTE.PA","AI.PA","ALV.DE","BNP.PA","SAN.PA","DTE.DE","AIR.PA","IBE.MC","BAYN.DE","CS.PA","MBG.DE","DHL.DE","BAS.DE","ABI.BR","IFX.DE","ENEL.MI","ISP.MI","UCG.MI","PHIA.AS","KER.PA","RMS.PA","DSY.PA","RI.PA","SU.PA","EL.PA","BN.PA","STLAM.MI","ADS.DE","MUV2.DE","DB1.DE","HEN3.DE","VOW3.DE","RWE.DE","FRE.DE","HEI.DE","ENR.DE","CON.DE","LIN.DE","BBVA.MC","SAN.MC","TEF.MC","ITX.MC","REP.MC","ACS.MC","FER.MC","CIE.MC","GRF.MC","MAP.MC","CABK.MC","UNA.AS","INGA.AS","WKL.AS","AD.AS","HEIA.AS","RAND.AS","PRX.AS","DSM-F.AS","AKZA.AS","NN.AS","AGN.AS","LIGHT.AS","NOVO-B.CO","DSV.CO","MAERSK-B.CO","CARL-B.CO","ORSTED.CO","VWS.CO","GN.CO","COLO-B.CO","PNDORA.CO","NZYM-B.CO","NOKIA.HE","FORTUM.HE","NESTE.HE","SAMPO.HE","UPM.HE","KNEBV.HE","STERV.HE","ORNBV.HE","TYRES.HE","METSB.HE","ROG.SW","NOVN.SW","ZURN.SW","SREN.SW","UBSG.SW","ABBN.SW","CSGN.SW","LONN.SW","GIVN.SW","SGSN.SW"]',
  100,
  'monthly',
  'equal',
  'STOXX50E',
  'draft',
  100000000,
  'EUR'
) ON CONFLICT DO NOTHING;

-- ── ANTON India 100 ─────────────────────────────────────────────────────────

INSERT INTO market_indexes (id, name, description, index_type, philosophy, universe, max_holdings, rebalance_frequency, weighting_method, benchmark_symbol, status, budget, currency)
VALUES (
  'midx_seed_india100',
  'ANTON India 100',
  'ANTON India 100 — Top 100 NIFTY 200 equities on NSE. 100M INR budget, equal-weight, monthly rebalance vs ^NSEI.',
  'geographic',
  'Indian market breadth across large and mid cap',
  '["RELIANCE.NS","TCS.NS","HDFCBANK.NS","INFY.NS","ICICIBANK.NS","HINDUNILVR.NS","ITC.NS","SBIN.NS","BHARTIARTL.NS","BAJFINANCE.NS","KOTAKBANK.NS","LT.NS","HCLTECH.NS","AXISBANK.NS","MARUTI.NS","WIPRO.NS","TITAN.NS","SUNPHARMA.NS","ULTRACEMCO.NS","NTPC.NS","ONGC.NS","TATAMOTORS.NS","TATASTEEL.NS","ADANIENT.NS","ADANIPORTS.NS","POWERGRID.NS","COALINDIA.NS","NESTLEIND.NS","BAJAJFINSV.NS","JSWSTEEL.NS","M&M.NS","GRASIM.NS","INDUSINDBK.NS","BRITANNIA.NS","CIPLA.NS","TECHM.NS","HINDALCO.NS","DRREDDY.NS","EICHERMOT.NS","SBILIFE.NS","DIVISLAB.NS","BPCL.NS","HDFCLIFE.NS","TATACONSUM.NS","APOLLOHOSP.NS","HEROMOTOCO.NS","UPL.NS","BAJAJ-AUTO.NS","DABUR.NS","GODREJCP.NS","PIDILITIND.NS","HAVELLS.NS","SIEMENS.NS","INDUSTOWER.NS","MUTHOOTFIN.NS","BERGEPAINT.NS","SBICARD.NS","ICICIPRULI.NS","COLPAL.NS","NAUKRI.NS","DLF.NS","TORNTPHARM.NS","SRF.NS","BANDHANBNK.NS","AUROPHARMA.NS","PEL.NS","AMBUJACEM.NS","ACC.NS","MARICO.NS","MCDOWELL-N.NS","CHOLAFIN.NS","LUPIN.NS","TATAPOWER.NS","VOLTAS.NS","IDFCFIRSTB.NS","JUBLFOOD.NS","PAGEIND.NS","BIOCON.NS","PNB.NS","BANKBARODA.NS","CANBK.NS","INDIANB.NS","IOC.NS","GAIL.NS","RECLTD.NS","PFC.NS","BEL.NS","HAL.NS","IRCTC.NS","ZOMATO.NS","PAYTM.NS","POLYCAB.NS","ABCAPITAL.NS","ATUL.NS","ASTRAL.NS","COFORGE.NS","LTIM.NS","PERSISTENT.NS","MPHASIS.NS","TRENT.NS"]',
  100,
  'monthly',
  'equal',
  '^NSEI',
  'draft',
  100000000,
  'INR'
) ON CONFLICT DO NOTHING;

-- ── ANTON Japan 100 ─────────────────────────────────────────────────────────

INSERT INTO market_indexes (id, name, description, index_type, philosophy, universe, max_holdings, rebalance_frequency, weighting_method, benchmark_symbol, status, budget, currency)
VALUES (
  'midx_seed_japan100',
  'ANTON Japan 100',
  'ANTON Japan 100 — Top 100 TOPIX equities on TSE. 100M JPY budget, equal-weight, monthly rebalance vs ^N225.',
  'geographic',
  'Japanese market breadth across TOPIX large cap',
  '["7203.T","6758.T","6861.T","8306.T","6501.T","9984.T","6902.T","7741.T","4063.T","8035.T","6367.T","9432.T","4502.T","6954.T","8316.T","7974.T","6594.T","4568.T","6971.T","8058.T","8031.T","8001.T","3382.T","4519.T","7267.T","6098.T","6981.T","4661.T","9433.T","8766.T","8802.T","6273.T","6301.T","4543.T","6503.T","7751.T","9020.T","9022.T","4901.T","7269.T","2802.T","2914.T","4507.T","8591.T","6857.T","3407.T","8725.T","6326.T","4911.T","5108.T","7201.T","6752.T","9531.T","4523.T","6702.T","4578.T","7270.T","6762.T","6988.T","9101.T","6506.T","8801.T","7733.T","8309.T","8303.T","4503.T","9021.T","5401.T","3402.T","4704.T","7011.T","6645.T","8630.T","7832.T","5802.T","3659.T","4684.T","6723.T","8002.T","2413.T","7731.T","4612.T","3861.T","6479.T","5713.T","7272.T","3289.T","9613.T","8750.T","2801.T","1925.T","6724.T","5020.T","5019.T","8267.T","1928.T","4452.T","6471.T","8604.T","2502.T"]',
  100,
  'monthly',
  'equal',
  '^N225',
  'draft',
  100000000,
  'JPY'
) ON CONFLICT DO NOTHING;
