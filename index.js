const fs = require('fs');
const request = require('request');

const reqOptions = {
	url: 'http://api.welcome.kakao.com',
	loginToken: 'Uk8Z317zZn0wkf3pE4Q0655j5hRj0r16N8p5XS04KdJV0',
	reqToken: '',
	interval: 250,
	requestCnt: 0
};

//	1. 위의 url로 GET하여 제출용 토큰을 받는다.
const options = { method: 'GET', url: reqOptions.url + '/token/' + reqOptions.loginToken };
requestKakaoAPI(options, getSeedUrl);

// 2. Seed API를 통해 카테고리별 문서의 URL 목록을 받아온다.
const categoryStatus = {};

function getSeedUrl(token) {
	reqOptions.reqToken = token;
	const options = { method: 'GET', url: reqOptions.url + '/seed' };
	requestKakaoAPI(options, transformSeedStringToArray);
}
function transformSeedStringToArray(seedString) {
	const seedArray = seedString.split('\n');
	seedArray.pop();

	for (let i = 0; i < seedArray.length; i++) {
		let category = seedArray[i].split('/')[2];

		categoryStatus[category] = {
			queue: { add: [], del: [] },
			dup: { add: {}, del: {} }
		};

		getDocument(seedArray[i]);
	}
}

// 3. Document API를 통해 각 Seed에서 document를 받아온다
function getDocument(seed) {
	const options = { method: 'GET', url: reqOptions.url + seed };
	requestKakaoAPI(options, classifyImages);
}
function classifyImages(body) {
	const { next_url, images } = JSON.parse(body);
	// category 식별
	const category = next_url.split('/')[2];

	let cat = categoryStatus[category],
		queue = cat.queue,
		dup = cat.dup;

	for (let i = 0; i < images.length; i++) {
		let image = images[i];

		if (dup[image.type][image.id]) {
			// 추가 혹은 삭제 작업을 했을 때
			continue;
		} else if (dup[image.type === 'add' ? 'del' : 'add'][image.id]) {
			// 반대되는 작업이 선행된 경우 반대쪽 플래그 제거
			delete dup[image.type === 'add' ? 'del' : 'add'][image.id];
		}

		dup[image.type][image.id] = true;
		queue[image.type].push(image);

		if (queue[image.type].length > 49) {
			if (image.type === 'add') getFeatures(queue[image.type]);
			if (image.type === 'del') deleteFeature(queue[image.type]);
			queue[image.type] = [];
		}
	}

	setTimeout(() => {
		getDocument(next_url);
	}, reqOptions.interval);
}

// 4. Feature Extraction API
function getFeatures(imagesAdding) {
	const options = { method: 'GET', url: reqOptions.url + '/image/feature?id=' };

	// making URL for get
	for (let i = 0; i < imagesAdding.length; i++) {
		options.url += (i === 0 ? '' : ',') + imagesAdding[i].id;
	}
	requestKakaoAPI(options, postFeatures);
}

// 5. Feature Save API
function postFeatures(body) {
	const options = { method: 'POST', url: reqOptions.url + '/image/feature' };
	options.body = '{"data":' + body.slice(body.indexOf(':[{') + 1);
	requestKakaoAPI(options);
}

// 6. Feature Delete API
function deleteFeature(imagesDeleting) {
	const options = { method: 'DELETE', url: reqOptions.url + '/image/feature', body: { data: [] } };

	for (let i = 0; i < imagesDeleting.length; i++) {
		options.body.data.push({ id: imagesDeleting[i].id });
	}

	options.json = true;
	requestKakaoAPI(options);
}

// request에 사용할 공용 function
let errorCnt = 0;
function requestKakaoAPI(options, callback) {
	if (reqOptions.reqToken) options.headers = { 'X-Auth-Token': reqOptions.reqToken };
	if (reqOptions.requestCnt < 49) {
		reqOptions.requestCnt++;
		request(options, function (err, res, body) {
			if (err || res.statusCode !== 200 && res.statusCode !== 403) {
				errorCnt++;
				console.log(err, body);
				if (options.method === 'POST' || options.method === 'DELETE') requestKakaoAPI(options);
			} else {
				if (callback) callback(body);
			}
		});
	} else {
		setTimeout(() => { requestKakaoAPI(options, callback); }, reqOptions.interval);
	}
}

// 분당 request 속도 조절
setInterval(() => {
	console.log('req cnt', reqOptions.requestCnt, 'error cnt', errorCnt, 'interval', reqOptions.interval);

	if (reqOptions.requestCnt > 48) reqOptions.interval += 5;
	else if (reqOptions.requestCnt < 45 && reqOptions.interval > 20) reqOptions.interval -= 5;

	reqOptions.requestCnt = 0;
}, 1000);