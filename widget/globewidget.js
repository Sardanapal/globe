var DAT = DAT || {};

DAT.Globe = function (container, options) {

    "use strict";

    options = options || {};

    var colorFn = function (x) {
            var c = new THREE.Color();
            c.setHSL(( 0.6 - ( x * 0.5 ) ), 1.0, 0.5);
            return c;
        };

    var RegionsRef = [
        {full: "Europe", short:"EU", loc: [47.97, 16.097], zoom : 1.0, countries:[35, 69, 186, 100, 103, 120, 140, 57,
            118, 28 , 48, 81, 167, 48, 134, 131, 58, 3, 84, 44, 59 , 111, 133, 144, 54, 112, 67, 13, 36,  113, 77, 94, 15, 175]},
        {full: "Korea", short:"KR", loc: [35.8615124,127.096405], zoom : 1.0, countries:[124]},
        {full: "North America", short:"NA", loc: [37.6,-95.665], zoom : 1.0, countries:[97, 150, 21]},
        {full: "North China", short:"CN_N", loc: [39.956174, 104.110969], zoom : 1.0, countries:[96]},
        {full: "Russia", short:"RU", loc: [55.749792,37.6324949], zoom : 1.0, countries:[92]},
        {full: "South China", short:"CN_S", loc: [27.425535, 106.923469], zoom : 1.0, countries:[96]},
        {full: "South-East Asia", short:"SEA", loc: [1.3147308,103.8470128], zoom : 1.0, countries:[91, 123, 138, 50,  107, 170, 160, 7, 228, 108]}
    ];

    var Shaders = {
            vertexShader: [
                'varying vec3 vNormal;',
                'varying vec2 vUv;',
                'void main() {',
                    'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
                    'vNormal = normalize( normalMatrix * normal );',
                    'vUv = uv;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D mapIndex;',
                'uniform sampler2D lookup;',
                'uniform sampler2D outline;',
                'uniform sampler2D blendImage;',
                'uniform sampler2D bump;',
                'varying vec3 vNormal;',
                'varying vec2 vUv;',

                'void main(){',
                    'vec4 mapColor = texture2D( mapIndex, vUv );',
                    'float indexedColor = mapColor.y;',
                    'vec2 lookupUV = vec2( indexedColor, 0.0 );',
                    'vec4 lookupColor = texture2D( lookup, lookupUV );',
                    'vec4 outlineColor = texture2D( outline, vUv );',
                    'vec4 blendColor = texture2D( blendImage, vUv );',

                    'gl_FragColor = 0.5 * outlineColor + 0.7 * lookupColor + 1.0 * blendColor;',
                '}'
            ].join('\n')
    };

    var EARTH_RADIUS = 150;
    var BAR_WIDTH = 2.75;
    var BAR_OPACITY = 0.8;
    var MAX_BAR_HEIGHT = 250;

    var camera, scene, renderer, w, h;
    var earth, globe;
    var raycaster;
    var barContainer, tweetContainer;
    var INTERSECTED = null;
    var barTooltip;

    // list of bar markers
    var markers = [];

    var overRenderer;

    var imgDir = 'image/';

    var curZoomSpeed = 0;

    var mouse = {x: 0, y: 0}, mouseOnDown = {x: 0, y: 0};
    var rotation = {x: 0, y: 0},
        target = {x: Math.PI * 1.7, y: Math.PI / 5.0},
        targetOnDown = {x: 0, y: 0};

    var mouseDown = false;
    var mouseVector = new THREE.Vector2();

    var distance = 10000, distanceTarget = 640;
    var PI_HALF = Math.PI / 2;
    var ROTATION_DELTA = 0.003;

    var regionData;
    var currentRegion;
    var currentTween;

    var lookupContext, lookupTexture;

    var controlPanel = new function () {
        this.AutoRotation = (options.autoRotation == undefined || options.autoRotation) ? true: false;
        this.RegionsAutoCycle = (options.regionsAutoCycle == undefined || !options.regionsAutoCycle) ? false: true;
        this.BattleMode = (options.battleMode == undefined || !options.battleMode) ? false: true;
        this.StarsVisible = (options.starsVisible == undefined || options.starsVisible) ? true : false;
        this.DayMode = (options.dayMode !== undefined && options.dayMode == false) ? false : true;
        this.ShowTooltip = (options.showTooltip !== undefined && options.showTooltip == false) ? false : true;
        this.ShowStatistic = (options.showStatistic !== undefined && options.showStatistic == false) ? false : true;
        this.ShowStatTable = (options.showStatTable !== undefined && options.showStatTable == true) ? true : false;
        this.TweetColor = (options.tweetColor !== undefined) ? options.tweetColor : "#000000";
        this.BarColor = (options.barColor !== undefined) ? options.barColor : "#000000";
        this.BattleBarColor = (options.barBattleColor !== undefined) ? options.barBattleColor : "#FF0000";
        this.RegionColor = (options.regionColor !== undefined) ? options.regionColor : "#00D200";
        this.BattleRegionColor = (options.regionBattleColor !== undefined) ? options.regionBattleColor : "#CC0000";
    }

    function init() {
        if(options.barWidth !== undefined && +options.barWidth > 0 && +options.barWidth <= 10) {
            BAR_WIDTH = +options.barWidth;
        }

        w = container.offsetWidth || window.innerWidth;
        h = container.offsetHeight || window.innerHeight;

        addControlPanel();

        scene = new THREE.Scene();
        camera = createCamera(w, h, distance);

        // Earth with bars on it
        earth = createEarth(EARTH_RADIUS);
        barContainer = new THREE.Object3D();
        tweetContainer = new THREE.Object3D();
        globe = new THREE.Object3D();
        globe.add(earth);
        globe.add(barContainer);
        globe.add(tweetContainer);
        scene.add(globe);
        scene.updateMatrixWorld(true);

        if(controlPanel.StarsVisible) {
            $("body").css("background", "#000000 url(" + imgDir + "starfield.jpg) repeat");
        }
        controlPanel.hideChangeSkinOption(controlPanel.BattleMode);

        renderer = createRenderer(w, h);

        raycaster = new THREE.Raycaster();

        barTooltip = createTooltip(container);
        createMarkersPattern(container);
        createStatisticTable(container);

        container.appendChild(renderer.domElement);
        container.addEventListener('mousedown', onMouseDown, false);
        container.addEventListener('mousemove', onMouseMove, false);

        document.addEventListener('keydown', onDocumentKeyDown, false);

        window.addEventListener('resize', onWindowResize, false);

        container.addEventListener('mouseover', function () {
            overRenderer = true;
        }, false);

        container.addEventListener('mouseout', function () {
            overRenderer = false;
        }, false);

        container.addEventListener( 'mousewheel', onMouseWheel, false );
        //	firefox
        container.addEventListener( 'DOMMouseScroll', function(e){
            var evt=window.event || e; //equalize event object
            onMouseWheel(evt);
        }, false );

        // run markers switching thread
        setInterval(switchOverMarkers, 2000);

        RegionsRef.nextRegion = 0;
        if(controlPanel.RegionsAutoCycle){
            cycleRegions();
            cycleRegions.threadId = setInterval(cycleRegions, 10000);
        }
    }

    function createCamera(width, height, distance) {
        var camera = new THREE.PerspectiveCamera(30, width / height, 1, 10000);
        camera.position.z = distance;
        return camera;
    }

    function createRenderer(width, height) {
        var renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        renderer.setSize(w, h);
        renderer.autoClear = false;
        renderer.setClearColor(0x000000, 0.0);
        renderer.domElement.style.position = 'absolute';
        return renderer;
    }

    function createEarth(radius) {
        var geometry = new THREE.SphereGeometry(radius, 40, 40);

        var lookupCanvas = document.createElement('canvas');
        lookupCanvas.width = 256;
        lookupCanvas.height = 1;
        lookupContext = lookupCanvas.getContext('2d');
        lookupTexture = new THREE.Texture( lookupCanvas );
        lookupTexture.magFilter = THREE.NearestFilter;
        lookupTexture.minFilter = THREE.NearestFilter;
        lookupTexture.needsUpdate = true;

        var mapTexture = THREE.ImageUtils.loadTexture(imgDir + "earth-index-shifted-gray.png");
        mapTexture.magFilter = THREE.NearestFilter;
        mapTexture.minFilter = THREE.NearestFilter;
        //mapTexture.needsUpdate = true;

        var outlineTexture = THREE.ImageUtils.loadTexture(imgDir + "earth-outline.png");
        //outlineTexture.needsUpdate = true;

        var blendImage = THREE.ImageUtils.loadTexture(imgDir + (controlPanel.BattleMode ? "battlemode.jpg" :
                controlPanel.DayMode ? "worldDay.jpg" : "worldNight.jpg"));

        var material = new THREE.ShaderMaterial({
            uniforms:{
                width:      { type: "f", value: window.innerWidth },
                height:     { type: "f", value: window.innerHeight },
                mapIndex:   { type: "t", value: mapTexture },
                outline:    { type: "t", value: outlineTexture },
                lookup:     { type: "t", value: lookupTexture },
                blendImage: { type: "t", value: blendImage }
            },
            vertexShader:   Shaders.vertexShader,
            fragmentShader: Shaders.fragmentShader
        });

        var earth = new THREE.Mesh(geometry, material);
        earth.rotation.y = Math.PI;

        return earth;
    }

    function createTooltip(container) {
        $('<div id="barTooltip" class="tooltip"></div>').insertAfter(container);
        return $('#barTooltip');
    }

    function createMarkersPattern(container){
        var pattern = '<div >'+
                          '<table class="marker">' +
                               '<tr>'+
                                  '<td><span class="bar"></span></td>' +
                                  '<td class="detail"></td>'+
                               '</tr>'+
                          '</table>'+
                      '</div>'+
                      '<div id="visualization" ></div>';
        $(pattern).insertAfter(container);
    }

    function createStatisticTable(container){
        var pattern = '<div><table id="stat_table" class = "statTable" style="display:'+
            (controlPanel.showStatTable ? 'inline':'none')+';"></table></div>';
        $(pattern).insertAfter(container);
    }

    function setEarthSkin(skinFileName) {
        earth.material.uniforms['blendImage'].value = THREE.ImageUtils.loadTexture(imgDir + skinFileName);
        earth.updateMorphTargets();
    }

    function cycleRegions() {
        var region = RegionsRef[RegionsRef.nextRegion];

        removeOldData();
        removeOldTweets();
        drawGameStatistic(regionData, region.full);
        setCameraToRegion(region.full);
        RegionsRef.nextRegion++;
        if (RegionsRef.nextRegion >= RegionsRef.length) {
            RegionsRef.nextRegion = 0;
        }
    };

    function regionsCycleOn(){
        cycleRegions();
        cycleRegions.threadId = setInterval(cycleRegions, 15000);
    }

    function regionsCycleOff(){
        clearInterval(cycleRegions.threadId);
        cycleRegions.threadId = 0;
    }

    function addControlPanel() {
        var gui = new dat.GUI();
        gui.close();

        gui.useLocalStorage = true;
        gui.remember(controlPanel);

        var controller = gui.add(controlPanel, 'AutoRotation').listen();

        controller = gui.add(controlPanel, 'RegionsAutoCycle').listen();
        controller.onChange(function (on) {
            if(on) {
                regionsCycleOn();
            } else {
                regionsCycleOff();
            }
        });
        controlPanel.hideRegionCyclingOption = (function(element){
            var checkBox = element;

            return function(disable) {
                checkBox.disabled = disable;
            };
        })(controller.domElement.childNodes[0]);

        var battleModeController = gui.add(controlPanel, 'BattleMode').listen();
        battleModeController.onChange(function (modeOn) {
            var skinFileName = controlPanel.BattleMode ? "battlemode.jpg" :
                controlPanel.DayMode ? "worldDay.jpg" : "worldNight.jpg";
            controlPanel.hideChangeSkinOption(modeOn);
            setEarthSkin(skinFileName);
            // in battle mode all bars should be red
            var color = new THREE.Color(modeOn ? controlPanel.BattleBarColor : controlPanel.BarColor);

            setFiguresColor(barContainer, color);
            paintRegion(currentRegion);
        });

        controller = gui.add(controlPanel, 'StarsVisible').listen();
        controller.onChange(function (value) {
            $("body").css("background", controlPanel.StarsVisible ? "#000000 url(" + imgDir + "starfield.jpg) repeat" : "#000000");
        });

        controller = gui.add(controlPanel, 'DayMode').listen();
        controller.onChange(function (value) {
            var skinFileName = controlPanel.DayMode ? "worldDay.jpg" : "worldNight.jpg";
            setEarthSkin(skinFileName);
        });
        controlPanel.hideChangeSkinOption = (function(element){
            var checkBox = element;

            return function(disable) {
                checkBox.disabled = disable;
            };
        })(controller.domElement.childNodes[0]);

        controller = gui.add(controlPanel, 'ShowTooltip').listen();
        controller = gui.add(controlPanel, 'ShowStatistic').listen();
        controller = gui.add(controlPanel, 'ShowStatTable').listen();
        controller.onChange(function (value) {
            $("#stat_table").toggle();
        });

        controlPanel.hideStatTableOption = (function(element){
            var checkBox = element;

            return function(disable) {
                checkBox.disabled = disable;
        };
        })(controller.domElement.childNodes[0]);

        var tweetColorController = gui.addColor(controlPanel, "TweetColor").listen();
        tweetColorController.onChange(function (value) {
            var color = new THREE.Color(value);
            setFiguresColor(tweetContainer, color);
        });

        var barColorController = gui.addColor(controlPanel, "BarColor").listen();
        barColorController.onChange(function (value) {
            var color = new THREE.Color(value);
            setFiguresColor(barContainer, color);
        });

        var barBattleColorController = gui.addColor(controlPanel, "BattleBarColor").listen();
        barBattleColorController.onChange(function (value) {
            var color = new THREE.Color(value);
            setFiguresColor(barContainer, color);
        });


        var regionColorController = gui.addColor(controlPanel, "RegionColor").listen();
        regionColorController.onChange(function (value) {
            // change region color if it was selected
            paintRegion(currentRegion);
        });

        var regionBattleColorController = gui.addColor(controlPanel, "BattleRegionColor").listen();
        regionBattleColorController.onChange(function (value) {
            // change region color if it was selected
            paintRegion(currentRegion);
        });

    }

    function setFiguresColor(container, color){
        for (var i = 0; i < container.children.length; i++) {
            var mesh = container.children[i];
            for (var j = 0; j < mesh.geometry.faces.length; j++) {
                mesh.geometry.faces[j].color = color;
            }
            mesh.material.color = color;
            mesh.geometry.colorsNeedUpdate = true;
        }
    }

    function getMax(array, fieldName) {
        var max = 0;
        if (typeof array != 'undefined' && array.length > 0) {
            max = +array[0][fieldName];
            for (var i = 1; i < array.length; i++) {
                if (max < +array[i][fieldName]) {
                    max = +array[i][fieldName];
                }
            }
        }
        return max;
    }

    // calc bar height by percents from max
    function getBarHeight(max, current){
        return current / max * MAX_BAR_HEIGHT;
    }

    function findRegionInRef(name, type){
        for(var i = 0; i < RegionsRef.length; i++){
            var curRegion = RegionsRef[i];
            if(name == (type == "full" ? curRegion.full : curRegion.short)){
                return curRegion;
            }
        }
        return null;
    }

    function drawPCUStatistic(jsonObj) {
        var lat, lng, perc, color;

        controlPanel.hideRegionCyclingOption(true);
        controlPanel.hideStatTableOption(false);
        if(controlPanel.ShowStatTable){
            $("#stat_table").show();
        }

        if(jsonObj == undefined || jsonObj._items == undefined || jsonObj._items[0] == undefined ||
            jsonObj._items[0].regions == undefined){
            return;
        }

        regionData = jsonObj;

        var regions = jsonObj._items[0].regions;
        var maxPCU = getMax(regions, "pccu");

        markers.fixed = true; // always show them if visible

        regions.forEach(function(region){
            var curRegion = findRegionInRef(region.region, "short");
            if(curRegion == null){
                return;
            }
            var coord = curRegion.loc;

            lat = coord[0];
            lng = coord[1];
            color = colorFn(region.pccu/maxPCU);
            perc = +region.pccu / maxPCU;
            addPoint(lat, lng, perc, color, curRegion.full, region.pccu);
        });
    };

    function getRegion(regionArr, regionName){
        var region;

        if(regionName == "All"){
            // get top 50 battles by all regions
            regionArr = JSON.parse(JSON.stringify(regionArr));

            region = regionArr.shift();
            regionArr.forEach(function(reg){
                region.cities = region.cities.concat(reg.cities);
            });

            region.cities.sort(function(a, b){
                if(+a.battles > +b.battles){
                    return -1;
                } else if(+a.battles < +b.battles){
                    return 1;
                }
                return 0;
            });

            region.cities = region.cities.slice(0, 50);

        } else {
            var curRegion = findRegionInRef(regionName, "full");
            if (curRegion == null) {
                return;
            }

            for (var i = 0; i < regionArr.length; i++) {
                if (curRegion.short == regionArr[i].region) {
                    region = regionArr[i];
                    break;
                }
            }
        }

        return region;
    }

    function drawGameStatistic(jsonObj, regionName) {
        controlPanel.hideStatTableOption(false);
        if(controlPanel.ShowStatTable){
            $("#stat_table").show();
        }

        if(jsonObj == undefined || jsonObj._items == undefined || jsonObj._items[0] == undefined ||
            jsonObj._items[0].regions == undefined){
            return;
        }

        regionData = jsonObj;

        var region = getRegion(jsonObj._items[0].regions, regionName);

        if (region == undefined || region.cities == undefined) {
            return;
        }

        var maxGames = getMax(region.cities, "battles");
        var maxPlayers = getMax(region.cities, "players");

        markers.fixed = false; // switch between visible markers

        region.cities.forEach(function(city){
            var lat = city.loc[0];
            var lng = city.loc[1];

            if(lat == 0.0 && lng == 0.0){
                console.log("Coordinates for " + city.city + " not found. City skiped.")
                return;
            }

            var colorGames = colorFn(city.battles / maxGames);
            var colorPlayers = colorFn(city.players / maxPlayers / 2);

            var sizeGames = getBarHeight(maxGames, +city.battles);
            var sizePlayers = getBarHeight(maxPlayers, +city.players) / 2;

            addDoublePoint(lat, lng, sizeGames, sizePlayers, colorGames, colorPlayers,
                city.city.slice(0, 1).toUpperCase() + city.city.slice(1), city.battles, city.players);
        });
    };
    

    function drawTweets(jsonObj) {
        var lat, lng;

        $("#stat_table").hide();
        controlPanel.hideStatTableOption(true);
        controlPanel.hideRegionCyclingOption(true);

        if(jsonObj == undefined || jsonObj._items == undefined){
            return;
        }

        var tweets = jsonObj._items;
        var maxWeight = getMax(tweets, "twit_cnt");

        markers.fixed = true;

        tweets.forEach(function(tweet){
            lat = tweet.loc[0];
            lng = tweet.loc[1];


            // create tweet bulbs
            /*var bulbRadius = 5;
            bulbRadius += 10 * tweet.twit_cnt / maxWeight;

            var color = colorFn(bulbRadius/15);
            addTweetBulb(lat, lng, color, bulbRadius, tweet.city, tweet.twit_cnt);*/

            var perc = +tweet.twit_cnt / maxWeight;
            var color = colorFn(perc);
            addTweetBar(lat, lng, perc, color, tweet.city, tweet.twit_cnt);
        });
    };

    function addTweetBulb(lat, lng, color, bulbRadius, city, tweetCnt) {
        if(controlPanel.TweetColor !== "#000000"){
            color = new THREE.Color(controlPanel.TweetColor);
        }

        var mesh = new THREE.Mesh(
            new THREE.SphereGeometry(bulbRadius, 20, 20),
            new THREE.MeshBasicMaterial({
                color : color,
                transparent: true,
                opacity: 0
            })
        );

        var pos = calcCoordinates(lat, lng, EARTH_RADIUS);

        mesh.position.x = pos.x;
        mesh.position.y = pos.y;
        mesh.position.z = pos.z;

        mesh.updateMatrix();

        tweetContainer.add(mesh);
        meshToggle(tweetContainer, mesh, 0.75);

        attachMarker( "<nobr>" + city + "</nobr>", coord, "Tweets: " + tweetCnt);
    }

    function addTweetBar(lat, lng, perc, color, city, tweetCnt) {
        if(controlPanel.TweetColor !== "#000000"){
            color = new THREE.Color(controlPanel.TweetColor);
        }

        var barHeight = Math.max(perc * MAX_BAR_HEIGHT, 1);
        var barWidth =  Math.max(BAR_WIDTH * 5 * perc, BAR_WIDTH);

        var geometry = new THREE.BoxGeometry(barWidth, barWidth, 1);
        var meshMaterial = new THREE.MeshBasicMaterial({color: color, transparent: true, opacity: BAR_OPACITY});

        var point = new THREE.Mesh(geometry, meshMaterial);
        point.name = city + " Tweets: " + tweetCnt;

        var coord = calcCoordinates(lat, lng, EARTH_RADIUS);
        point.position.x = coord.x;
        point.position.y = coord.y;
        point.position.z = coord.z;

        point.lookAt(earth.position);
        point.updateMatrix();

        tweetContainer.add(point);

        var zoffset = 1 + (tweetCnt * 0.15) + Math.random() * 0.15;
        if (zoffset > 1.5) zoffset = 1.5;
        var coord1 = calcCoordinates(lat, lng, zoffset * EARTH_RADIUS);

        //attachMarker( city, coord1, "Tweets: " + tweetCnt);

        point.scale.z = barHeight;

        /*
        var height = {z : 1};
        var tweenGrow = new TWEEN.Tween(height)
            .to({z: barHeight}, 2000)
            .onUpdate(function () {
                point.scale.z = height.z;
            });

        tweenGrow.start();
        */
    }

    function addPoint(lat, lng, perc, color, region, pccu) {
        var barHeight = Math.max(perc * MAX_BAR_HEIGHT, 1);
        var barWidth =  Math.max(BAR_WIDTH * 5 * perc, BAR_WIDTH);

        if (!controlPanel.BattleMode) {
            if (controlPanel.BarColor !== "#000000") {
                color = new THREE.Color(controlPanel.BarColor);
            }
        } else {
            if(controlPanel.BattleBarColor !== "#000000" ) {
                color = new THREE.Color(controlPanel.BattleBarColor);
            }
        }

        var geometry = new THREE.BoxGeometry(barWidth, barWidth, 1);
        var meshMaterial = new THREE.MeshBasicMaterial({color: color, transparent: true, opacity: BAR_OPACITY});

        var point = new THREE.Mesh(geometry, meshMaterial);
        point.name = "Region: " + region + "<br> PCCU: " + pccu;

        var coord = calcCoordinates(lat, lng, EARTH_RADIUS);
        point.position.x = coord.x;
        point.position.y = coord.y;
        point.position.z = coord.z;

        point.lookAt(earth.position);
        point.updateMatrix();

        barContainer.add(point);

        var coord1 = calcCoordinates(lat, lng, 1.15 * EARTH_RADIUS);
        attachMarker( region, coord1, "PCCU: " + pccu);

        var height = {z : 1};
        var tweenGrow = new TWEEN.Tween(height)
            .to({z: barHeight}, 2000)
            .onUpdate(function () {
                point.scale.z = height.z;
            });

        tweenGrow.start();
    }

    function addDoublePoint(lat, lng, size1, size2, color1, color2, city, battles, players) {
        var combined = new THREE.Geometry();

        var geometry = new THREE.BoxGeometry(BAR_WIDTH, BAR_WIDTH, 1);
        var material = new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, opacity: 0});

        if (!controlPanel.BattleMode) {
            if (controlPanel.BarColor !== "#000000") {
                color1 = new THREE.Color(controlPanel.BarColor);
                color2 = new THREE.Color(controlPanel.BarColor);
            }
        } else {
            if(controlPanel.BattleBarColor !== "#000000" ) {
                color1 = new THREE.Color(controlPanel.BattleBarColor);
                color2 = new THREE.Color(controlPanel.BattleBarColor);
            }
        }


        var barPlayers = new THREE.Mesh(geometry);
        for (var j = 0; j < geometry.faces.length; j++) {
            geometry.faces[j].color = color1;
        }
        barPlayers.scale.z = Math.max(size1, 0.1); // avoid non-invertible matrix
        barPlayers.updateMatrix();
        THREE.GeometryUtils.merge(combined, barPlayers);

        var barGames = new THREE.Mesh(geometry);
        for (var j = 0; j < geometry.faces.length; j++) {
            geometry.faces[j].color = color2;
        }
        barGames.position.x = -BAR_WIDTH;
        barGames.scale.z = Math.max(size2, 0.1); // avoid non-invertible matrix
        barGames.updateMatrix();
        THREE.GeometryUtils.merge(combined, barGames);


        var mesh = new THREE.Mesh(combined, material);
        mesh.name = "City: " + city + "<br> Total battles : " + city.battles + "<br> Active players : " + city.players;

        var coord = calcCoordinates(lat, lng, EARTH_RADIUS);

        mesh.position.x = coord.x;
        mesh.position.y = coord.y;
        mesh.position.z = coord.z;

        mesh.lookAt(earth.position);
        mesh.updateMatrix();

        barContainer.add(mesh);

        var coord1 = calcCoordinates(lat, lng, 1.15 * EARTH_RADIUS);
        attachMarker( city, coord1, "Battles: " + battles, "Players: " + players);

        meshToggle(barContainer, mesh, BAR_OPACITY);
    }

    function removeOldTweets(criteria){
        for(var i = 0; i < tweetContainer.children.length; i++){
            var mesh = tweetContainer.children[i];
            meshToggle(tweetContainer, mesh, 0);
        }
    }

    function meshToggle(container, mesh, resOpacity){
        var opacity = {x : mesh.material.opacity};
        var tweenToggle = new TWEEN.Tween(opacity)
            .to({x: resOpacity}, 2000)
            .onUpdate(function () {
                mesh.material.opacity = opacity.x;
            })
            .onComplete(function () {
                if(resOpacity == 0) {
                    mesh.geometry.dispose();
                    mesh.material.dispose();
                    container.remove(mesh);
                }
            });

        tweenToggle.start();
    }

    function calcCoordinates(latitude, longtitude, radius) {
        var coord = new THREE.Vector3();

        var phi = (90 - latitude) * Math.PI / 180;
        var theta = (180 - longtitude) * Math.PI / 180;

        coord.x = radius * Math.sin(phi) * Math.cos(theta);
        coord.y = radius * Math.cos(phi);
        coord.z = radius * Math.sin(phi) * Math.sin(theta);

        return coord;
    }

    function onMouseDown(event) {
        event.preventDefault();
        mouseDown = true;

        container.addEventListener('mouseup', onMouseUp, false);
        container.addEventListener('mouseout', onMouseOut, false);

        target.y = rotation.y;

        mouseOnDown.x = -event.clientX;
        mouseOnDown.y = event.clientY;

        targetOnDown.x = target.x;
        targetOnDown.y = target.y;

        container.style.cursor = 'move';
    }

    function onMouseMove(event) {
        mouse.x = event.clientX;
        mouse.y = event.clientY;
        if (mouseDown) {
            var zoomDamp = distance / 1000;

            target.x = targetOnDown.x + (-mouse.x - mouseOnDown.x) * 0.005 * zoomDamp;
            target.y = targetOnDown.y + (mouse.y - mouseOnDown.y) * 0.005 * zoomDamp;

            target.y = target.y > PI_HALF ? PI_HALF : target.y;
            target.y = target.y < -PI_HALF ? -PI_HALF : target.y;
        } else {
            mouseVector.x = 2 * (event.clientX / w) - 1;
            mouseVector.y = 1 - 2 * ( event.clientY / h );
        }
    }

    function onMouseUp(event) {
        mouseDown = false;

        container.removeEventListener('mouseup', onMouseUp, false);
        container.removeEventListener('mouseout', onMouseOut, false);
        container.style.cursor = 'auto';
    }

    function onMouseOut(event) {
        container.removeEventListener('mouseup', onMouseUp, false);
        container.removeEventListener('mouseout', onMouseOut, false);
    }

    function onMouseWheel( event ){
        var delta = 0;

        if (event.wheelDelta) { /* IE/Opera. */
            delta = event.wheelDelta/120;
        } else if( event.detail ){ //	firefox
            delta = -event.detail/3;
        }

        if (delta) {
            zoom(delta * 20);
        }

        event.returnValue = false;
    }

    function onDocumentKeyDown(event) {
        switch (event.keyCode) {
            case 38:
                zoom(100);
                event.preventDefault();
                break;
            case 40:
                zoom(-100);
                event.preventDefault();
                break;
        }
    }

    function onWindowResize(event) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function zoom(delta) {
        distanceTarget -= delta;
        distanceTarget = distanceTarget > 1100 ? 1100 : distanceTarget;
        distanceTarget = distanceTarget < 350 ? 350 : distanceTarget;
    }

    function animate() {
        requestAnimationFrame(animate);
        render();
        TWEEN.update();
    }

    function isInArray(array, value){
        if(array == undefined){
            return false;
        }
        for(var i = 0; i < array.length; i++){
            if(array[i] == value){
                return true;
            }
        }
        return false;
    }

    function paintRegion(regionRef){
        var countries = regionRef == null ? [] : regionRef.countries;
        var color = (controlPanel.BattleMode) ? controlPanel.BattleRegionColor : controlPanel.RegionColor;

        lookupContext.clearRect(0,0,256,1);
        for (var i = 0; i < 228; i++){
            if (i == 0) {
                lookupContext.fillStyle = "rgba(0,0,0,1.0)";
            }else if (isInArray(countries, i)) {
                lookupContext.fillStyle = color;
            }else {
                lookupContext.fillStyle = "rgba(0,0,0,1.0)";
            }

            lookupContext.fillRect( i, 0, 1, 1 );
        }

        lookupTexture.needsUpdate = true;
    }

    function setCameraToRegion(regionName) {
        if(currentTween !== undefined) {
            currentTween.stop();
        }
        currentRegion = findRegionInRef(regionName, "full");
        if(currentRegion != null && currentRegion.loc !== undefined){
            setCameraToPoint(currentRegion.loc[0], currentRegion.loc[1], true, currentRegion.zoom);
        } else {
            var oldDistance = {x: distanceTarget};
            var tweenSetZoomIn = new TWEEN.Tween(oldDistance)
                .to({x: 640 }, 1000)
                .onUpdate(function () {
                    distanceTarget = oldDistance.x;
                });
            tweenSetZoomIn.start();
            currentTween = tweenSetZoomIn;
        }

        paintRegion(currentRegion);
    }

    function setCameraToPoint(lat, lng, zoom, zoomFactor) {

        zoom = typeof zoom !== 'undefined' ? zoom : false;
        zoomFactor = typeof zoomFactor !== 'undefined' ? zoomFactor : 1.0;

        var coord = calcCoordinates(lat, lng, distance);

        globe.rotation.y = globe.rotation.y % ( 2 * Math.PI);
        if(!controlPanel.RegionsAutoCycle) {
            controlPanel.AutoRotation = false;
        }

        // define globe rotation task to zero point
        var rotationStart = globe.rotation.y;// rotation start point
        var rotationEnd = 0; //(2 * Math.PI - globe.rotation.y) > globe.rotation.y ? 0 : 2 * Math.PI;
        if(controlPanel.RegionsAutoCycle && controlPanel.AutoRotation){
            rotationEnd = -PI_HALF / 2;
            ROTATION_DELTA = 0;
        }

        var oldTarget = new THREE.Vector3();
        oldTarget.x = target.x;
        oldTarget.y = target.y;
        oldTarget.z = rotationStart;

        var newTarget = new THREE.Vector3();
        newTarget.y = Math.asin( coord.y / distance );
        newTarget.x = Math.asin( (lng < 0 ? Math.abs(coord.x):coord.x) / distance / Math.cos(newTarget.y)) + (lng < 0 ? Math.PI : 0 );
        newTarget.z = rotationEnd;

        var dist = newTarget.distanceTo(oldTarget);

        // rotation task
        var tweenSetPoint = new TWEEN.Tween(oldTarget)
            .to(newTarget, dist * 500)
            .onUpdate(function () {
                target.x = oldTarget.x;
                target.y = oldTarget.y;
                globe.rotation.y = oldTarget.z;
            })
            .onStop(function(){
                ROTATION_DELTA = 0.003;
            })
            .onComplete(function(){
                ROTATION_DELTA = 0.003;
            });

	    // zoom task
        var oldDistance = {x: distanceTarget};
        var tweenSetZoomOut = new TWEEN.Tween(oldDistance)
            .to({x: distanceTarget * 1.5}, 700)
            .onUpdate(function () {
                distanceTarget = oldDistance.x;
            });

        var tweenSetZoomIn = new TWEEN.Tween(oldDistance)
            .to({x: distanceTarget / zoomFactor}, 700)
            .onUpdate(function () {
                distanceTarget = oldDistance.x;
            });

        if (zoom) {
            tweenSetZoomOut.chain(tweenSetPoint);
            tweenSetPoint.chain(tweenSetZoomIn);
            tweenSetZoomOut.start();
            currentTween = tweenSetZoomOut;
        } else {
            tweenSetPoint.start();
            currentTween = tweenSetPoint;
        }
    }


    function render() {
        zoom(curZoomSpeed);

        globe.rotation.y += controlPanel.AutoRotation ? ROTATION_DELTA : 0.0;

        rotation.x += (target.x - rotation.x) * 0.2;
        rotation.y += (target.y - rotation.y) * 0.2;
        distance += (distanceTarget - distance) * 0.3;

        camera.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y);
        camera.position.y = distance * Math.sin(rotation.y);
        camera.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y);

        camera.lookAt(earth.position);

        if (controlPanel.ShowTooltip && !mouseDown) {
            checkBarSelection();
        }

        markers.forEach(function(marker){
            marker.update();
        });

        renderer.render(scene, camera);
    }

    function checkBarSelection(){
        raycaster.setFromCamera(mouseVector, camera);
        var intersects = raycaster.intersectObjects(barContainer.children, true);
        if (intersects.length > 0) {
            if (INTERSECTED != intersects[0].object) {
                if (INTERSECTED != null) {
                    for (var i = 0; i < INTERSECTED.originalColors.length; i++) {
                        INTERSECTED.geometry.faces[i].color.setHex(INTERSECTED.originalColors[i]);
                    }
                    INTERSECTED.material.color.setHex(INTERSECTED.originalMaterialColor);
                    INTERSECTED.geometry.colorsNeedUpdate = true;
                }
                INTERSECTED = intersects[0].object;

                INTERSECTED.originalColors = [];

                for (var i = 0; i < INTERSECTED.geometry.faces.length; i++) {
                    INTERSECTED.originalColors.push(INTERSECTED.geometry.faces[i].color.getHex());
                    INTERSECTED.geometry.faces[i].color.setHex(0xFF0000);
                }
                INTERSECTED.originalMaterialColor = INTERSECTED.material.color.getHex();
                INTERSECTED.material.color.setHex(0xFF0000);
                INTERSECTED.geometry.colorsNeedUpdate = true;

                if(INTERSECTED.name !== undefined && INTERSECTED.name != "") {
                    barTooltip.html(INTERSECTED.name).show();
                    barTooltip.css('left', mouse.x + "px");
                    barTooltip.css('top', mouse.y + "px");
                }

            }
        } else {
            if (INTERSECTED != null) {
                for (var i = 0; i < INTERSECTED.originalColors.length; i++) {
                    INTERSECTED.geometry.faces[i].color.setHex(INTERSECTED.originalColors[i]);
                }
                INTERSECTED.material.color.setHex(INTERSECTED.originalMaterialColor);
                INTERSECTED.geometry.colorsNeedUpdate = true;
                barTooltip.hide();
            }
            INTERSECTED = null;
        }
    }

    function removeOldData() {
        barContainer.children.forEach(function(mesh){
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        barContainer.children = [];
        INTERSECTED = null;
        removeMarkers();
        $('#stat_table').empty();
    }

    function runCycling(jsonObj){
        if(jsonObj == undefined || jsonObj._items == undefined || jsonObj._items[0] == undefined ||
            jsonObj._items[0].regions == undefined){
            return;
        }

        regionData = jsonObj;

        controlPanel.hideRegionCyclingOption(false);
        controlPanel.RegionsAutoCycle = true;
        regionsCycleOn();
    }

    function stopCycling(){
        controlPanel.RegionsAutoCycle = false;
        if(cycleRegions.threadId != 0) {
            regionsCycleOff();
        }
        controlPanel.hideRegionCyclingOption(false);
    }

    function attachGeoMarker( title, lat, lng, text1, text2 ) {
        removeMarkers();
        var coord = calcCoordinates(lat, lng, EARTH_RADIUS);
        attachMarker( title, coord, text1, text2 )
    }

    function attachMarker( title, position, text1, text2 ){
        var container = $("#visualization")
        var template = $(".marker:first");
        var marker = template.clone();

        container.append( marker );

        marker.setPosition = function(x,y,z){
            this.css({"left": x + 'px', "top": y + 'px', "z-index": z});
        }

        marker.setVisible = function( isVisible ){
            if(!isVisible || !controlPanel.ShowStatistic){
                this.hide();
                this.canBeVisible = false;
                return;
            }
            this.canBeVisible = true;
            if(markers.fixed){
                this.show();
            }
        }

        var detailLayer = marker.find('.detail');
        marker.detailLayer = detailLayer;

        marker.setSize = function( s ){
            var detailSize = 2 + s;
            detailSize = constrain(detailSize, 8, 15);
            this.detailLayer.css("font-size", detailSize + 'pt');
            var totalHeight = detailSize * 1.2;
            this.css("font-size", totalHeight + 'pt');
        }

        marker.update = function(){
            var matrix = globe.matrixWorld;
            var abspos = position.clone().applyProjection(matrix);
            var screenPos = screenXY(abspos);

            var center = globe.position.clone();
            var camPosition = camera.position.clone();
            var distToCenter = camPosition.distanceTo(center);
            var distToBar = camPosition.distanceTo(abspos);

            var remoteness = distToBar / distToCenter * 100;
            this.setVisible(remoteness < 85); // nearer 95% from globe center

            this.setSize( 100 - remoteness );

            var zIndex = Math.floor( 100 -  remoteness);
            this.setPosition( screenPos.x, screenPos.y, zIndex );
        }

        var nameLayer = marker.find('.bar');
        nameLayer.html('<nbsp>' + title.replace(' ','&nbsp;') + '</nbsp>');

        var text ='<nobr>' + text1 + '</nbsp>';
        if(text2 !== undefined) {
            text += '<br/><nobr>' + text2 + '</nobr>';
        }
        detailLayer.html(text);

        markers.push( marker );

        // add to table
        addRowToStatTable(title, text1, text2);
    }

    function addRowToStatTable(title, text1, text2){
        if($('#stat_table tr').length >= 10){
            return;
        }

        var table = $('#stat_table');
        var rowTemplate = '<tr width="100px">'+
            '<td><span class="statName"></span></td>' +
            '<td class="statDesc"></td>'+
            '</tr>';
        var row = $(rowTemplate).appendTo(table);

        $(row).find('.statName').html('<nbsp>' + title.replace(' ','&nbsp;') + '</nbsp>');

        var text ='<nobr>' + text1 + '</nbsp>';
        if(text2 !== undefined) {
            text += '<br/><nobr>' + text2 + '</nobr>';
        }

        $(row).find('.statDesc').html(text);
    }

    function removeMarkers(){
        $('#visualization').empty();
        markers = [];
    }

    function screenXY(positionIn3D){
        var widthHalf = 0.5 * renderer.context.canvas.width;
        var heightHalf = 0.5 * renderer.context.canvas.height;

        var vector = positionIn3D.clone();
        vector.project(camera);

        var result = new THREE.Vector2();
        result.x = ( vector.x * widthHalf ) + widthHalf;
        result.y = - ( vector.y * heightHalf ) + heightHalf;

        return result;
    }

    function constrain(value, min, max){
        if( value < min ) {
            value = min;
        } else if( value > max ) {
            value = max;
        }
        return value;
    }

    function switchOverMarkers(){
        if(markers.fixed){
            return;
        }
        var visible = markers.filter(function(marker){
            return marker.canBeVisible;
        });

        if(visible.length == 0){
            return;
        }

        var curMarker = null;
        visible.forEach(function(marker, i){
            if(marker.is(':visible')){
                curMarker = marker;
                curMarker.index = i;
                curMarker.hide();
            }
        });

        var nextIndex = curMarker == null || curMarker.index + 1 >= visible.length ? 0 : curMarker.index + 1;
        curMarker = visible[nextIndex];
        curMarker.show();
    }

    init();
    this.animate = animate;
    this.drawPCUStatistic = drawPCUStatistic;
    this.drawGameStatistic = drawGameStatistic;
    this.drawTweets = drawTweets;
    this.removeOldTweets = removeOldTweets;
    this.removeOldData = removeOldData;
    this.runCycling = runCycling;
    this.stopCycling = stopCycling;
    this.setCameraToPoint = setCameraToPoint;
    this.setCameraToRegion = setCameraToRegion;
    this.attachGeoMarker = attachGeoMarker;

    return this;
};
