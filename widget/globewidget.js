var DAT = DAT || {};

DAT.Globe = function (container, options) {

    "use strict";

    options = options || {};

    var colorFn = function (x) {
            var c = new THREE.Color();
            c.setHSL(( 0.6 - ( x * 0.5 ) ), 1.0, 0.5);
            return c;
        };

    var RegionCoordinates = {
        "Europe": [47.97, 16.097],
        "Korea": [38.199, 127.204],
        "North America": [52.279184, -103.289827],
        "North China": [39.956174, 104.110969],
        "South China": [27.425535, 106.923469],
        "Russia": [60.959843, 58.232063],
        "South-East Asia": [17.324551, 114.965461]
    };

    var Shaders = {
        'earth': {
            uniforms: {
                'texture': {type: 't', value: null}
            },
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
                'uniform sampler2D texture;',
                'varying vec3 vNormal;',
                'varying vec2 vUv;',
                'void main() {',
                'vec3 diffuse = texture2D( texture, vUv ).xyz;',
                'float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );',
                'vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );',
                'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
                '}'
            ].join('\n')
        }
    };

    var EARTH_RADIUS = 150;
    var BAR_WIDTH = 2.75;
    var BAR_OPACITY = 0.8;
    var MAX_BAR_HEIGHT = 250;

    var camera, scene, renderer, w, h;
    var earth, stars, countryOutlines, globe;
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

    var distance = 100000, distanceTarget = 100000;
    var PI_HALF = Math.PI / 2;

    var controlPanel = new function () {
        this.AutoRotation = (options.autoRotation == undefined || options.autoRotation) ? 0.003: 0.00;
        this.StarsVisible = (options.starsVisible == undefined || options.starsVisible) ? true : false;
        this.DayMode = (options.dayMode !== undefined && options.dayMode == false) ? false : true;
        this.ShowTooltip = (options.showTooltip !== undefined && options.showTooltip == false) ? false : true;
        this.ShowStatistic = (options.showStatistic !== undefined && options.showStatistic == false) ? false : true;
        this.ShowStatTable = (options.showStatTable !== undefined && options.showStatTable == true) ? true : false;
        this.TweetColor = (options.tweetColor !== undefined) ? options.tweetColor : "#000000";
        this.BarColor = (options.barColor !== undefined) ? options.barColor : "#000000";
    }

    function init() {
        if(options.barWidth !== undefined && +options.barWidth > 0 && +options.barWidth <= 10) {
            BAR_WIDTH = +options.barWidth;
        }

        w = container.offsetWidth || window.innerWidth;
        h = container.offsetHeight || window.innerHeight;

        scene = new THREE.Scene();
        camera = createCamera(w, h, distance);

        // Earth with bars on it
        earth = createEarth(EARTH_RADIUS);
        barContainer = new THREE.Object3D();
        tweetContainer = new THREE.Object3D();
        countryOutlines = createCountryOutlines(EARTH_RADIUS);
        globe = new THREE.Object3D();
        globe.add(earth);
        globe.add(barContainer);
        globe.add(tweetContainer);
        globe.add(countryOutlines);
        scene.add(globe);
        scene.updateMatrixWorld(true);

        stars = createStars(1000, 64);
        if(controlPanel.StarsVisible) {
            scene.add(stars);
        }

        renderer = createRenderer(w, h);

        raycaster = new THREE.Raycaster();

        addControlPanel();

        barTooltip = createTooltip(container);
        createMarkersPattern(container);
        createStatisticTable(container);

        container.appendChild(renderer.domElement);
        container.addEventListener('mousedown', onMouseDown, false);
        container.addEventListener('mousemove', onMouseMove, false);

        document.addEventListener('keydown', onDocumentKeyDown, false);

        //window.addEventListener('resize', onWindowResize, false);

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
    }

    function createCamera(width, height, distance) {
        var camera = new THREE.PerspectiveCamera(30, width / height, 1, 10000);
        camera.position.z = distance;
        return camera;
    }

    function createRenderer(width, height) {
        var renderer = new THREE.WebGLRenderer({antialias: true});
        renderer.setSize(w, h);
        renderer.domElement.style.position = 'absolute';
        return renderer;
    }

    function createEarth(radius) {
        var geometry = new THREE.SphereGeometry(radius, 40, 40);

        var shader = Shaders['earth'];
        var uniforms = THREE.UniformsUtils.clone(shader.uniforms);

        uniforms.texture.value = THREE.ImageUtils.loadTexture(imgDir + (controlPanel.DayMode ? "worldDay.jpg" : "worldNight.jpg"));

        var material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader
        });

        var earth = new THREE.Mesh(geometry, material);
        earth.rotation.y = Math.PI;

        return earth;
    }

    function createCountryOutlines(radius) {
        var mesh = new THREE.Mesh(
            new THREE.SphereGeometry(radius + 0.2, 40, 40),
            new THREE.MeshBasicMaterial({
                map: THREE.ImageUtils.loadTexture(imgDir + 'outlines/All.png'),
                side: THREE.FrontSide,
                transparent: true,
                opacity: 0.25
            })
        );
        mesh.rotation.y = Math.PI;

        return mesh;
    }

    function createStars(radius, segments) {
        return new THREE.Mesh(
            new THREE.SphereGeometry(radius, segments, segments),
            new THREE.MeshBasicMaterial({
                map: THREE.ImageUtils.loadTexture(imgDir + 'galaxy_starfield.png'),
                side: THREE.BackSide
            })
        );
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
        var shader = Shaders['earth'];
        var uniforms = THREE.UniformsUtils.clone(shader.uniforms);

        uniforms['texture'].value = THREE.ImageUtils.loadTexture(imgDir + skinFileName);

        var material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader
        });

        earth.material = material;
        earth.updateMorphTargets();
    }

    function addControlPanel() {
        var gui = new dat.GUI();
        gui.close();

        var controller = gui.add(controlPanel, 'AutoRotation', {
            Off: 0,
            Slow: 0.003,
            Middle: 0.025,
            Fast: 0.05
        }).listen();

        controller = gui.add(controlPanel, 'StarsVisible');
        controller.onChange(function (value) {
            controlPanel.StarsVisible ? scene.add(stars) : scene.remove(stars);
        });

        controller = gui.add(controlPanel, 'DayMode');
        controller.onChange(function (value) {
            var skinFileName = controlPanel.DayMode ? "worldDay.jpg" : "worldNight.jpg";
            setEarthSkin(skinFileName);
        });

        controller = gui.add(controlPanel, 'ShowTooltip');
        controller = gui.add(controlPanel, 'ShowStatistic');
        controller = gui.add(controlPanel, 'ShowStatTable');
        controller.onChange(function (value) {
            $("#stat_table").toggle();
        });

        var tweetColorController = gui.addColor(controlPanel, "TweetColor");
        tweetColorController.onChange(function (value) {
            for (var i = 0; i < tweetContainer.children.length; i++) {
                var mesh = tweetContainer.children[i];
                mesh.material.color = new THREE.Color(value);
            }
        });

        var barColorController = gui.addColor(controlPanel, "BarColor");
        barColorController.onChange(function (value) {
            for (var i = 0; i < barContainer.children.length; i++) {
                var mesh = barContainer.children[i];
                for (var j = 0; j < mesh.geometry.faces.length; j++) {
                    mesh.geometry.faces[j].color = new THREE.Color(value);
                }
                mesh.material.color = new THREE.Color(value);
                mesh.geometry.colorsNeedUpdate = true;
            }
        });
    }

    function getMax(array, fieldName){
        var max = +array[0][fieldName];
        for(var i = 1; i < array.length; i++){
            if(max < +array[i][fieldName]){
                max = +array[i][fieldName];
            }
        }
        return max;
    }

    // calc bar height by percents from max
    function getBarHeight(max, current){
        return current / max * MAX_BAR_HEIGHT;
    }

    function drawPCUStatistic(jsonObj) {
        var lat, lng, perc, color;

        if(jsonObj == undefined || jsonObj._items == undefined || jsonObj._items[0] == undefined ||
            jsonObj._items[0].regions == undefined){
            return;
        }

        var regions = jsonObj._items[0].regions;
        var maxPCU = getMax(regions, "pccu");

        markers.fixed = true; // always show them if visible

        regions.forEach(function(region){
            var coord = RegionCoordinates[region.region];
            if (coord == undefined) {
                return;
            }
            lat = coord[0];
            lng = coord[1];
            color = colorFn(region.pccu/maxPCU);
            perc = +region.pccu / maxPCU;
            addPoint(lat, lng, perc, color, region.region, region.pccu);
        });
    };

    function drawGameStatistic(jsonObj, regionName) {
        if(jsonObj == undefined || jsonObj._items == undefined || jsonObj._items[0] == undefined ||
            jsonObj._items[0].regions == undefined){
            return;
        }

        var regionArr = jsonObj._items[0].regions;

        var region;
        for (var i = 0; i < regionArr.length; i++) {
            if (regionName == regionArr[i].region) {
                region = regionArr[i];
                break;
            }
        }
        if (region == undefined || region.cities == undefined) {
            return;
        }

        var maxGames = getMax(region.cities, "battles");
        var maxPlayers = getMax(region.cities, "players");

        markers.fixed = false; // switch between visible markers

        region.cities.forEach(function(city){
            var lat = city.loc[0];
            var lng = city.loc[1];
            var colorGames = colorFn(city.battles / maxGames);
            var colorPlayers = colorFn(city.players / maxPlayers / 2);

            var sizeGames = getBarHeight(maxGames, +city.battles);
            var sizePlayers = getBarHeight(maxPlayers, +city.players) / 2;

            addDoublePoint(lat, lng, sizeGames, sizePlayers, colorGames, colorPlayers,
                city.city.slice(0, 1).toUpperCase() + city.city.slice(1), city.battles, city.players);
        });
    };

    function drawTweets(jsonObj) {
        var lat, lng, color;

        if(jsonObj == undefined || jsonObj._items == undefined){
            return;
        }

        var tweets = jsonObj._items;
        var maxWeight = getMax(tweets, "twit_cnt");

        tweets.forEach(function(tweet){
            lat = tweet.loc[0];
            lng = tweet.loc[1];
            //color = new THREE.Color();
            //color.setHex(0xAAFF);

            var bulbRadius = 5;
            bulbRadius += 10 * tweet.twit_cnt / maxWeight;

            color = colorFn(bulbRadius/15);
            addTweetPoint(lat, lng, color, bulbRadius, tweet.city, tweet.twit_cnt);
        });
    };

    function addTweetPoint(lat, lng, color, bulbRadius, city, tweetCnt) {
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
        attachMarker( "<nobr>" + city + "</nobr>", pos, "Tweets: " + tweetCnt);
    }

    function addPoint(lat, lng, perc, color, region, pccu) {
        var barHeight = Math.max(perc * MAX_BAR_HEIGHT, 1);
        var barWidth =  Math.max(BAR_WIDTH * 5 * perc, BAR_WIDTH);
        if(controlPanel.BarColor !== "#000000"){
            color = new THREE.Color(controlPanel.BarColor);
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
        attachMarker( region, coord, "PCCU: " + pccu);

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

        if(controlPanel.BarColor !== "#000000"){
            color1 = color2 = new THREE.Color(controlPanel.BarColor);
        }

        var barPlayers = new THREE.Mesh(geometry);
        for (var j = 0; j < geometry.faces.length; j++)
            geometry.faces[j].color = color1;
        barPlayers.scale.z = Math.max(size1, 0.1); // avoid non-invertible matrix
        barPlayers.updateMatrix();
        THREE.GeometryUtils.merge(combined, barPlayers);

        var barGames = new THREE.Mesh(geometry);
        for (var j = 0; j < geometry.faces.length; j++)
            geometry.faces[j].color = color2;
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
        attachMarker( city, coord, "Battles: " + battles, "Players: " + players);

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

    function setCameraToRegion(region) {
        var coord = RegionCoordinates[region];
        if (coord !== undefined) {
            setCameraToPoint(coord[0], coord[1]);
        }
        var fileName = imgDir + 'outlines/' + region + '.png';
        countryOutlines.material.map = THREE.ImageUtils.loadTexture(fileName, undefined, undefined, function () {
            console.log("File with texture " + fileName + " not found!")
        });
    }

    function setCameraToPoint(lat, lng) {
        var coord = calcCoordinates(lat, lng, distance);

        globe.rotation.y = globe.rotation.y % ( 2 * Math.PI);
        controlPanel.AutoRotation = 0.00;

        // define globe rotation task to zero point
        var rotationStart = globe.rotation.y;// rotation start point
        var rotationEnd = (2 * Math.PI - globe.rotation.y) > globe.rotation.y ? 0 : 2 * Math.PI;

        var oldTarget = new THREE.Vector3();
        oldTarget.x = target.x;
        oldTarget.y = target.y;
        oldTarget.z = rotationStart;

        var newTarget = new THREE.Vector3();
        newTarget.y = Math.asin(coord.y / distance);
        newTarget.x = Math.asin(coord.x / distance / Math.cos(newTarget.y)) + (lng < 0 ? Math.PI : 0);
        newTarget.z = rotationEnd;

        // rotation task
        var tweenSetPoint = new TWEEN.Tween(oldTarget)
            .to(newTarget, 2000)
            .onUpdate(function () {
                target.x = oldTarget.x;
                target.y = oldTarget.y;
                globe.rotation.y = oldTarget.z;
            });

        // zoom task
        var oldDistance = {x: distanceTarget};
        var tweenSetZoom = new TWEEN.Tween(oldDistance)
            .to({x: 700}, 1000)
            .onUpdate(function () {
                distanceTarget = oldDistance.x;
            });

        tweenSetPoint.chain(tweenSetZoom);
        tweenSetPoint.start();
    }


    function render() {
        zoom(curZoomSpeed);

        globe.rotation.y += +controlPanel.AutoRotation;

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
        barContainer.children = [];
        INTERSECTED = null;
        removeMarkers();
        $('#stat_table').empty();
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
            this.setVisible(remoteness < 95); // nearer 95% from globe center

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
    this.setCameraToPoint = setCameraToPoint;
    this.setCameraToRegion = setCameraToRegion;

    return this;
};