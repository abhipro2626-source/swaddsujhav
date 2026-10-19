
-- =====================================================================
-- Part D: demo data for Feature Pack 2 (idempotent where practical).
-- =====================================================================

-- ---------------------------------------------------------------- describable traits for every sweet
update public.sweets s set shape = t.shape, colours = t.colours, served_temp = t.served_temp, key_flavours = t.key_flavours,
  has_syrup = t.has_syrup, has_filling = t.has_filling, is_fried = t.is_fried, shelf_life_days = t.shelf, aliases = t.aliases
from (values
(3,'round',array['white']::text[],'cold',array['chhena','cardamom']::text[],true,false,false,2,array['rosogolla','rasgulla','bengali rasgulla','spongy rasgulla','roshogolla','rasagola','rasgula']::text[]),
(4,'round',array['cream','yellow']::text[],'cold',array['milk','saffron','pistachio','cardamom']::text[],false,false,false,2,array['ras malai','rasmalai','cream rasgulla']::text[]),
(5,'round',array['white']::text[],'room',array['chhena','cardamom']::text[],false,false,false,2,array['sandesh','shondesh','bengali sandesh']::text[]),
(6,'round',array['brown']::text[],'room',array['chhena','gur']::text[],false,false,false,2,array['nolen gur sandesh','gur sandesh','patali gur sandesh']::text[]),
(7,'bowl',array['cream']::text[],'cold',array['milk','curd']::text[],false,false,false,2,array['mishti doi','sweet curd','bengali yogurt']::text[]),
(8,'long',array['pink','white','yellow']::text[],'room',array['chhena','khoya','coconut']::text[],true,false,false,2,array['cham cham','chom chom','bengali chamcham','chomchom','chum chum']::text[]),
(9,'round',array['brown']::text[],'warm',array['chhena','ghee']::text[],true,false,true,2,array['pantua','bengali pantua']::text[]),
(10,'round',array['brown']::text[],'warm',array['chhena','ghee']::text[],true,false,true,2,array['ledikeni','lady kenny']::text[]),
(11,'round',array['white','brown']::text[],'room',array['chhena','khoya']::text[],false,true,false,2,array['kheer kadam','khir kadam']::text[]),
(12,'round',array['yellow']::text[],'room',array['chhena','saffron']::text[],true,true,false,2,array['rajbhog','bengali rajbhog']::text[]),
(13,'long',array['dark-brown']::text[],'warm',array['chhena','ghee']::text[],true,false,true,2,array['langcha','longcha','lyangcha']::text[]),
(14,'irregular',array['orange','yellow']::text[],'room',array['besan','saffron','ghee']::text[],true,false,true,3,array['mihidana','bengali mihidana']::text[]),
(15,'irregular',array['yellow','white']::text[],'room',array['rice','chhena','ghee']::text[],true,false,true,3,array['sitabhog','bengali sitabhog']::text[]),
(16,'square',array['brown']::text[],'warm',array['chhena','cardamom']::text[],false,false,false,3,array['chhena poda','chenna poda','odisha chhena poda']::text[]),
(17,'round',array['brown']::text[],'warm',array['chhena','ghee']::text[],true,false,true,2,array['chhena jhili','chenna jhili']::text[]),
(18,'layered',array['golden']::text[],'room',array['ghee']::text[],true,false,true,10,array['khaja','odisha khaja']::text[]),
(19,'round',array['brown','dark-brown']::text[],'warm',array['khoya','cardamom','rose']::text[],true,false,true,3,array['gulab jamun','jamun','gulabjamun','gulab jaman']::text[]),
(20,'round',array['dark-brown','black']::text[],'warm',array['khoya','ghee']::text[],true,false,true,3,array['kala jamun','black jamun']::text[]),
(21,'spiral',array['orange','yellow']::text[],'warm',array['saffron','ghee']::text[],true,false,true,2,array['jalebi','jilapi','zulbia','jilebi','jalabi']::text[]),
(22,'spiral',array['orange','red']::text[],'warm',array['urad dal','saffron','ghee']::text[],true,false,true,2,array['imarti','ambriti']::text[]),
(23,'bowl',array['cream']::text[],'cold',array['milk','cardamom','pistachio']::text[],false,false,false,2,array['rabri','rabdi']::text[]),
(24,'cylinder',array['cream']::text[],'cold',array['milk','pistachio','saffron']::text[],false,false,false,5,array['kulfi','indian ice cream']::text[]),
(25,'square',array['white']::text[],'room',array['ash gourd','rose']::text[],true,false,false,10,array['agra petha','petha']::text[]),
(26,'round',array['white','yellow']::text[],'room',array['ash gourd','saffron']::text[],true,false,false,5,array['angoori petha','mini petha']::text[]),
(27,'square',array['yellow','cream']::text[],'room',array['besan','ghee','cardamom']::text[],false,false,true,20,array['soan papdi','son papdi','patisa']::text[]),
(28,'round',array['golden']::text[],'room',array['ghee','milk']::text[],true,false,true,3,array['ghewar','ghevar']::text[]),
(29,'round',array['golden']::text[],'room',array['ghee']::text[],true,false,true,10,array['balushahi','badusha']::text[]),
(30,'round',array['golden']::text[],'warm',array['milk','fennel']::text[],true,false,true,2,array['malpua','malpoa']::text[]),
(31,'irregular',array['golden']::text[],'room',array['khoya','dry fruits','ghee']::text[],false,true,true,7,array['gujiya','gujia','karanji']::text[]),
(32,'round',array['golden']::text[],'room',array['khoya','dry fruits','butter']::text[],false,true,false,7,array['baked gujiya','baked mawa gujiya']::text[]),
(33,'round',array['cream','yellow']::text[],'room',array['khoya','cardamom']::text[],false,false,false,5,array['peda','doodh peda','milk peda','khoya peda']::text[]),
(34,'round',array['brown']::text[],'room',array['khoya','cardamom']::text[],false,false,false,5,array['mathura peda','brown peda','mathura ka peda']::text[]),
(35,'round',array['brown','dark-brown']::text[],'room',array['khoya']::text[],false,false,false,5,array['dharwad peda','kunda','kunda peda']::text[]),
(36,'square',array['white','cream']::text[],'room',array['milk','chhena','cardamom','pistachio']::text[],false,false,false,2,array['kalakand','kalakand barfi','kalakhand']::text[]),
(37,'square',array['brown','cream']::text[],'room',array['milk','ghee']::text[],false,false,false,3,array['milk cake','doodh cake','alwar milk cake']::text[]),
(38,'square',array['white','cream']::text[],'room',array['khoya','cardamom']::text[],false,false,false,5,array['khoya barfi','mawa barfi','doodh barfi']::text[]),
(39,'diamond',array['white','silver']::text[],'room',array['cashew','ghee']::text[],false,false,false,15,array['kaju katli','kaju barfi','kaju katri']::text[]),
(40,'roll',array['white','green','silver']::text[],'room',array['cashew','pistachio']::text[],false,true,false,15,array['kaju pista roll','pista roll']::text[]),
(41,'roll',array['white','brown']::text[],'room',array['cashew','fig']::text[],false,true,false,15,array['kaju anjeer roll','anjeer roll']::text[]),
(42,'square',array['brown']::text[],'room',array['fig','dates','almond','cashew']::text[],false,false,false,15,array['anjeer barfi','fig barfi']::text[]),
(43,'roll',array['brown']::text[],'room',array['dates','almond','cashew']::text[],false,false,false,15,array['khajur roll','khajur barfi','date roll']::text[]),
(44,'diamond',array['white']::text[],'room',array['cashew','ghee']::text[],false,false,false,10,array['sugar free kaju katli','diet kaju katli']::text[]),
(45,'round',array['brown']::text[],'room',array['dates','almond','cashew','raisin']::text[],false,false,false,20,array['dry fruit laddoo','dry fruit laddu']::text[]),
(46,'square',array['white','yellow']::text[],'room',array['almond','saffron']::text[],false,false,false,10,array['badam barfi','badam katli']::text[]),
(47,'square',array['green']::text[],'room',array['pistachio','khoya']::text[],false,false,false,10,array['pista barfi','pista katli']::text[]),
(48,'square',array['white']::text[],'room',array['coconut','milk']::text[],false,false,false,5,array['coconut barfi','nariyal barfi']::text[]),
(49,'square',array['yellow']::text[],'room',array['gram flour','ghee']::text[],false,false,false,15,array['besan barfi','besan ki barfi']::text[]),
(50,'square',array['brown']::text[],'room',array['khoya','cocoa']::text[],false,false,false,5,array['chocolate barfi','choco barfi']::text[]),
(51,'square',array['brown']::text[],'room',array['milk','wheat','ghee','nuts']::text[],false,false,false,10,array['dodha barfi','dodha']::text[]),
(52,'round',array['brown']::text[],'room',array['wheat flour','ghee','jaggery','almond']::text[],false,false,true,20,array['pinni','atta pinni']::text[]),
(53,'round',array['brown']::text[],'room',array['wheat flour','ghee']::text[],false,false,false,15,array['atta laddoo','atta laddu']::text[]),
(54,'round',array['brown']::text[],'room',array['wheat flour','ghee','nuts']::text[],false,false,false,20,array['panjiri','panjiri laddoo']::text[]),
(55,'irregular',array['red','orange']::text[],'warm',array['carrot','milk','ghee']::text[],false,false,false,3,array['gajar ka halwa','gajrela']::text[]),
(56,'irregular',array['yellow']::text[],'warm',array['moong dal','ghee','milk']::text[],false,false,false,3,array['moong dal halwa']::text[]),
(57,'irregular',array['yellow']::text[],'warm',array['semolina','ghee','cardamom']::text[],false,false,false,2,array['sooji halwa','rava kesari']::text[]),
(58,'irregular',array['orange']::text[],'warm',array['wheat flour','ghee']::text[],false,false,false,2,array['atta halwa','kada prasad']::text[]),
(59,'irregular',array['yellow']::text[],'warm',array['almond','ghee','saffron']::text[],false,false,false,3,array['badam halwa']::text[]),
(60,'irregular',array['green']::text[],'warm',array['bottle gourd','milk','ghee']::text[],false,false,false,2,array['lauki halwa','doodhi halwa']::text[]),
(61,'round',array['yellow','orange']::text[],'room',array['gram flour','ghee','cardamom']::text[],false,false,true,5,array['boondi laddoo','boondi laddu']::text[]),
(62,'round',array['orange']::text[],'room',array['gram flour','ghee','saffron']::text[],false,false,true,5,array['motichoor laddoo','motichoor laddu']::text[]),
(63,'round',array['yellow','golden']::text[],'room',array['besan','ghee','cardamom']::text[],false,false,false,15,array['besan laddu','gram flour ball','besan ke laddoo','besan laddo']::text[]),
(64,'round',array['yellow','golden']::text[],'room',array['besan','ghee','cardamom','stevia']::text[],false,false,false,15,array['sugar free besan laddu','diet besan laddoo','besan laddoo sugarless']::text[]),
(65,'round',array['brown','black']::text[],'room',array['sesame','jaggery','peanuts']::text[],false,false,false,30,array['til laddu','sesame ball','til gul laddoo','til ke laddoo']::text[]),
(66,'round',array['yellow','white']::text[],'room',array['semolina','coconut','ghee','cashew']::text[],false,false,false,10,array['rava laddu','sooji laddoo','semolina ball','rava laddo']::text[]),
(67,'round',array['white']::text[],'room',array['coconut','jaggery','cardamom']::text[],false,false,false,7,array['nariyal laddoo','coconut laddu','kobbari laddu']::text[]),
(68,'round',array['brown']::text[],'room',array['wheat','ghee','jaggery','nuts']::text[],false,false,true,20,array['gond laddu','dink laddoo','edible gum laddoo']::text[]),
(69,'round',array['brown']::text[],'room',array['fenugreek','wheat','jaggery','ghee']::text[],false,false,true,20,array['methi laddu','fenugreek laddoo']::text[]),
(70,'round',array['brown']::text[],'room',array['wheat','ghee','jaggery','cardamom']::text[],false,false,true,15,array['churma laddu','wheat laddoo']::text[]),
(71,'square',array['yellow','golden']::text[],'room',array['besan','ghee','saffron','nuts']::text[],false,false,false,7,array['mohan thal','besan barfi']::text[]),
(72,'bowl',array['cream','white']::text[],'cold',array['milk','cardamom','nutmeg','nuts']::text[],false,false,false,2,array['basundi milk','rabri']::text[]),
(73,'bowl',array['white','yellow']::text[],'cold',array['curd','saffron','cardamom']::text[],false,false,false,3,array['shrikhand','hung curd dessert']::text[]),
(74,'bowl',array['yellow','orange']::text[],'cold',array['curd','mango']::text[],false,false,false,2,array['mango shrikhand','amrakhand']::text[]),
(75,'irregular',array['white']::text[],'warm',array['rice','coconut','jaggery','cardamom']::text[],false,true,false,1,array['modak','ukadiche modak','steamed dumpling']::text[]),
(76,'irregular',array['white','yellow']::text[],'room',array['khoya','saffron']::text[],false,false,false,3,array['mawa modak','khoya modak']::text[]),
(77,'round',array['yellow']::text[],'warm',array['wheat','chana dal','jaggery','ghee']::text[],false,true,false,3,array['puran poli','holige','obbattu','bobbattu']::text[]),
(78,'round',array['white','golden']::text[],'room',array['coconut','poppy seeds']::text[],false,true,true,7,array['karanji','gujiya','karjikai']::text[]),
(79,'layered',array['white','golden']::text[],'room',array['ghee']::text[],false,false,true,10,array['chirote','chiroti']::text[]),
(80,'round',array['brown']::text[],'room',array['rice','jaggery','poppy seeds','ghee']::text[],false,false,true,10,array['anarsa','anarse']::text[]),
(81,'diamond',array['white','golden']::text[],'room',array['ghee','milk']::text[],false,false,true,20,array['shankarpali','shakarpara','shakkarpara']::text[]),
(82,'square',array['yellow','golden']::text[],'room',array['besan','ghee']::text[],false,false,true,15,array['mysore pak','mysore paak']::text[]),
(83,'bowl',array['brown']::text[],'warm',array['milk','curd']::text[],false,false,false,2,array['kunda','belgaum kunda']::text[]),
(84,'bowl',array['white','cream']::text[],'warm',array['rice','milk','cardamom','cashew']::text[],false,false,false,1,array['payasam','kheer']::text[]),
(85,'bowl',array['brown']::text[],'warm',array['rice ada','coconut milk','jaggery','cardamom']::text[],false,false,false,1,array['ada pradhaman','pradhaman']::text[]),
(86,'bowl',array['white']::text[],'warm',array['rice ada','milk','cardamom']::text[],false,false,false,1,array['palada payasam','palada']::text[]),
(87,'round',array['brown']::text[],'warm',array['rice','banana','jaggery','coconut']::text[],false,false,true,3,array['unniyappam','appam']::text[]),
(88,'round',array['brown']::text[],'room',array['rice','jaggery','cardamom']::text[],false,false,true,10,array['adhirasam','athirasam']::text[]),
(89,'round',array['white']::text[],'warm',array['rice','coconut','jaggery']::text[],false,true,false,1,array['kozhukattai','modakam']::text[]),
(90,'bowl',array['yellow','golden']::text[],'warm',array['rice','moong dal','jaggery','ghee']::text[],false,false,false,1,array['sakkarai pongal','pongal']::text[]),
(91,'bowl',array['orange','brown']::text[],'warm',array['wheat','ghee']::text[],false,false,false,5,array['tirunelveli halwa','wheat halwa']::text[]),
(92,'bowl',array['green','yellow']::text[],'warm',array['ash gourd','ghee','cashew']::text[],false,false,false,3,array['kasi halwa','ash gourd halwa']::text[]),
(93,'square',array['yellow','golden']::text[],'room',array['ghee','besan']::text[],false,false,false,15,array['mysore pak','ghee mysore pak','besan barfi','mysorepa']::text[]),
(94,'round',array['golden','brown']::text[],'room',array['ghee']::text[],true,false,true,7,array['badusha','balushahi','badushah','balushahi sweet']::text[]),
(95,'spiral',array['orange','yellow']::text[],'warm',array['saffron','urad dal']::text[],true,false,true,2,array['jangiri','imarti','jangra','zangiri']::text[]),
(96,'square',array['brown','yellow']::text[],'warm',array['bread','milk','saffron','ghee']::text[],true,false,false,2,array['double ka meetha','shahi tukda','bread pudding','meetha']::text[]),
(97,'bowl',array['orange','brown']::text[],'warm',array['apricot','cream']::text[],true,false,false,3,array['qubani ka meetha','apricot dessert','khubani ka meetha']::text[]),
(98,'square',array['golden','white']::text[],'warm',array['bread','rabri','saffron','nuts']::text[],true,false,true,2,array['shahi tukda','bread rabri','shahi tukra']::text[]),
(99,'roll',array['white','cream']::text[],'cold',array['malai','khoya','nuts']::text[],false,true,false,2,array['malai gilori','gilori','malai roll']::text[]),
(100,'bowl',array['white','yellow']::text[],'cold',array['milk','cream','saffron']::text[],false,false,false,1,array['makhan malai','nimish','daulat ki chaat']::text[]),
(101,'square',array['brown','golden']::text[],'room',array['khoya','coconut','clove']::text[],true,true,true,5,array['lavang latika','laung latika','lavang latta']::text[]),
(102,'layered',array['brown','cream']::text[],'room',array['milk']::text[],false,false,false,3,array['khurchan','milk khurchan']::text[]),
(103,'flat',array['brown']::text[],'room',array['sesame','jaggery']::text[],false,false,false,30,array['gur gajak','gajak','sesame brittle']::text[]),
(104,'round',array['brown']::text[],'room',array['gur','jaggery','peanuts','til']::text[],false,false,false,20,array['gur laddoo','jaggery laddoo']::text[]),
(105,'round',array['brown']::text[],'room',array['jaggery','sesame']::text[],false,false,false,30,array['gur revdi','revdi','rewari']::text[]),
(106,'square',array['yellow','cream']::text[],'room',array['besan','ghee','cardamom']::text[],false,false,false,15,array['patisa','soan papdi','son papdi']::text[]),
(107,'flat',array['brown']::text[],'room',array['peanuts','jaggery']::text[],false,false,false,30,array['peanut chikki','chikki','groundnut chikki']::text[]),
(108,'flat',array['brown']::text[],'room',array['sesame','jaggery']::text[],false,false,false,30,array['til chikki','til patti']::text[]),
(109,'flat',array['brown','green']::text[],'room',array['almond','cashew','pistachio','jaggery']::text[],false,false,false,30,array['dry fruit chikki','mixed nut chikki']::text[]),
(110,'square',array['brown']::text[],'room',array['wheat','ghee','nuts']::text[],false,false,false,20,array['sohan halwa','multani sohan halwa']::text[]),
(111,'square',array['dark-brown']::text[],'room',array['milk','wheat','ghee']::text[],false,false,false,15,array['habshi halwa','milk halwa']::text[]),
(112,'round',array['golden','brown']::text[],'warm',array['khoya','dry fruits','ghee']::text[],true,true,true,5,array['mawa kachori','khoya kachori']::text[]),
(113,'round',array['yellow','white']::text[],'cold',array['mango','chhena','milk']::text[],false,false,false,2,array['mango rasmalai','aam rasmalai']::text[]),
(114,'diamond',array['brown']::text[],'room',array['cashew','cocoa']::text[],false,false,false,15,array['chocolate kaju katli','chocolate kaju barfi']::text[]),
(115,'roll',array['white','pink']::text[],'room',array['cashew','rose']::text[],false,true,false,10,array['gulkand kaju roll','rose kaju roll']::text[]),
(116,'square',array['yellow','green']::text[],'room',array['khoya','saffron','pistachio']::text[],false,false,false,5,array['kesar kulfi barfi','saffron barfi']::text[]),
(117,'round',array['green','white']::text[],'room',array['betel leaf','coconut','gulkand']::text[],false,true,false,5,array['paan laddoo','paan coconut laddoo']::text[]),
(118,'square',array['cream','yellow']::text[],'room',array['khoya','fennel','rose','saffron']::text[],false,false,false,5,array['thandai barfi','thandai khoya barfi']::text[]),
(119,'square',array['brown']::text[],'room',array['khoya']::text[],false,false,false,10,array['bal mithai','chocolate mithai']::text[]),
(120,'cylinder',array['brown']::text[],'room',array['khoya','coconut']::text[],false,false,false,5,array['singori','singauri']::text[]),
(121,'round',array['brown']::text[],'room',array['wheat','jaggery','fennel','coconut']::text[],false,false,true,15,array['thekua','khajur']::text[]),
(122,'round',array['brown','white']::text[],'room',array['rice','jaggery','sesame']::text[],false,false,true,10,array['bihari anarsa','anarsa']::text[]),
(123,'layered',array['golden']::text[],'room',array['ghee']::text[],false,false,true,15,array['silao khaja','khaja','bihari khaja','layered pastry']::text[]),
(124,'square',array['brown']::text[],'room',array['sesame','jaggery']::text[],false,false,false,20,array['tilkut','til papdi','sesame brittle','til ki chikki']::text[]),
(125,'square',array['white']::text[],'room',array['chhena','cardamom']::text[],false,false,false,2,array['chena murki','chhena murki','paneer cubes']::text[]),
(126,'flat',array['white']::text[],'room',array['rice','ghee','dry fruits']::text[],false,true,false,5,array['pootharekulu','paper sweet','rice paper sweet']::text[]),
(127,'round',array['brown']::text[],'room',array['rice flour','jaggery','sesame']::text[],false,false,true,10,array['ariselu','kajja','arisalu']::text[]),
(128,'cylinder',array['golden']::text[],'room',array['ghee']::text[],true,false,true,7,array['kakinada kaja','kaja','kakinada khaja']::text[]),
(129,'round',array['yellow']::text[],'room',array['gram flour','jaggery','ghee','cardamom']::text[],false,false,true,10,array['bandar laddu','thokkudu laddu','besan laddu']::text[]),
(130,'round',array['orange']::text[],'room',array['gram flour','ghee','cashew','cardamom']::text[],false,false,true,7,array['tirupati laddu','srivari laddu','temple laddu']::text[]),
(131,'bowl',array['white']::text[],'warm',array['milk','vermicelli','dates','nuts']::text[],false,false,false,1,array['sheer khurma','seviyan kheer']::text[]),
(132,'bowl',array['white']::text[],'warm',array['vermicelli','milk','ghee']::text[],false,false,false,1,array['meethi seviyan','sweet vermicelli']::text[]),
(133,'bowl',array['white','yellow']::text[],'cold',array['rice','milk','saffron','pistachio']::text[],false,false,false,1,array['phirni','firni']::text[]),
(134,'bowl',array['white']::text[],'warm',array['rice','milk','cardamom']::text[],false,false,false,1,array['chawal ki kheer','rice kheer','payasam']::text[]),
(135,'bowl',array['white']::text[],'warm',array['fox nuts','milk','cardamom']::text[],false,false,false,1,array['makhana kheer','lotus seed pudding']::text[]),
(136,'round',array['yellow']::text[],'room',array['khoya','malai','saffron']::text[],false,false,false,3,array['kesar malai peda','malai peda','saffron peda']::text[]),
(137,'spiral',array['orange','white']::text[],'warm',array['milk','ghee']::text[],true,false,true,1,array['jalebi rabri','jalebi with rabdi']::text[]),
(138,'square',array['brown']::text[],'room',array['chhena','ghee']::text[],true,false,true,3,array['chhena gaja','chena gaja']::text[]),
(139,'round',array['brown']::text[],'room',array['chhena','milk','cardamom']::text[],true,false,true,2,array['rasabali','odisha rasabali']::text[]),
(140,'round',array['white']::text[],'cold',array['chhena','milk']::text[],true,false,false,1,array['khira sagara','kheer sagar']::text[]),
(141,'round',array['white','brown']::text[],'room',array['coconut','jaggery']::text[],false,false,false,5,array['narkel naru','coconut laddu']::text[]),
(142,'roll',array['white','brown']::text[],'warm',array['rice flour','coconut','jaggery','khoya']::text[],false,true,false,1,array['patishapta','pitha']::text[]),
(143,'round',array['white']::text[],'room',array['coconut']::text[],false,false,false,5,array['narikol laru','assamese coconut laddu']::text[]),
(144,'round',array['brown']::text[],'room',array['sticky rice','sesame','jaggery']::text[],false,true,true,7,array['til pitha','assamese pitha']::text[]),
(145,'bowl',array['purple']::text[],'warm',array['black rice','milk']::text[],false,false,false,1,array['chak-hao kheer','black rice kheer']::text[]),
(146,'layered',array['brown']::text[],'room',array['coconut milk','egg','ghee']::text[],false,false,false,7,array['bebinca','bibik']::text[]),
(147,'round',array['dark-brown']::text[],'room',array['coconut milk','jaggery','rice flour']::text[],false,false,false,7,array['dodol','goan dodol']::text[]),
(148,'flat',array['white','green']::text[],'room',array['semolina','milk','pistachio']::text[],false,false,false,10,array['bombay ice halwa','ice halwa','mahim halwa']::text[]),
(149,'square',array['yellow']::text[],'cold',array['colostrum milk','jaggery','cardamom','nutmeg']::text[],false,false,false,2,array['kharvas','junnu','posu']::text[]),
(150,'round',array['brown']::text[],'warm',array['khoya','sugar-free']::text[],true,false,true,2,array['sugar-free gulab jamun','diet gulab jamun']::text[]),
(151,'round',array['white']::text[],'cold',array['chhena','sugar-free']::text[],true,false,false,2,array['sugar-free rasgulla','diet rasgulla']::text[]),
(152,'roll',array['brown']::text[],'room',array['fig','almond','cashew','pistachio']::text[],false,false,false,15,array['sugar-free anjeer roll','anjeer roll','fig roll']::text[]),
(153,'round',array['brown']::text[],'room',array['ragi','jaggery','ghee','peanuts']::text[],false,false,false,15,array['ragi laddu','ragi unda','finger millet ball']::text[]),
(154,'bowl',array['yellow','orange']::text[],'warm',array['semolina','ghee','saffron','cashew']::text[],false,false,false,2,array['kesari bath','sheera','rava kesari']::text[]),
(155,'round',array['yellow']::text[],'warm',array['wheat','chana dal','jaggery','ghee']::text[],false,true,false,3,array['obbattu','holige','puran poli','bobbatlu']::text[]),
(156,'square',array['yellow']::text[],'room',array['gram flour','ghee','cashew','almond']::text[],false,false,false,15,array['mysore pak','dry fruit mysore pak']::text[]),
(157,'bowl',array['cream']::text[],'room',array['milk']::text[],false,false,false,3,array['palkova','milk khoa','doodh peda']::text[]),
(158,'bowl',array['white']::text[],'warm',array['rice','milk']::text[],false,false,false,1,array['paal payasam','rice kheer','milk payasam']::text[]),
(159,'round',array['brown']::text[],'warm',array['rice','jaggery','ghee','coconut']::text[],false,false,true,3,array['neyyappam','unni appam']::text[]),
(160,'square',array['brown']::text[],'room',array['rice','coconut','jaggery']::text[],false,false,false,4,array['halbai','rice halwa']::text[]),
(161,'spiral',array['brown']::text[],'room',array['jaggery','ghee']::text[],false,false,true,15,array['gavvalu','teepi gavvalu']::text[]),
(162,'layered',array['white','green']::text[],'room',array['ghee','pistachio']::text[],false,false,true,7,array['sutarfeni','sootar feni']::text[]),
(163,'round',array['yellow','cream']::text[],'room',array['khoya','ghee','dry fruits']::text[],true,true,true,3,array['ghari','surti ghari']::text[]),
(164,'bowl',array['white','yellow']::text[],'cold',array['milk','rice','saffron','nuts']::text[],false,false,false,1,array['doodh pak','doodh paak']::text[]),
(165,'square',array['brown']::text[],'room',array['wheat','ghee','jaggery']::text[],false,false,false,15,array['sukhdi','gol papdi']::text[]),
(166,'bowl',array['yellow']::text[],'cold',array['hung curd','saffron','cardamom','nuts']::text[],false,false,false,3,array['kesar shrikhand','shrikhand']::text[]),
(167,'round',array['brown']::text[],'warm',array['khoya','dry fruits']::text[],true,true,true,3,array['mawa bati','khoya bati']::text[]),
(168,'long',array['white','cream']::text[],'cold',array['chhena','malai']::text[],true,true,false,2,array['malai chop','chhena chop']::text[]),
(169,'long',array['yellow']::text[],'room',array['chhena','saffron','khoya']::text[],true,false,false,2,array['kesar chamcham','cham cham']::text[]),
(170,'round',array['brown']::text[],'room',array['chhena','khoya']::text[],true,false,true,3,array['kheer mohan','kheer mohan sweet']::text[]),
(171,'bowl',array['white']::text[],'room',array['chhena','milk']::text[],false,false,false,1,array['chhena kheer','chhena kheeri']::text[]),
(172,'round',array['brown','green']::text[],'room',array['almond','pistachio','ghee']::text[],false,false,false,15,array['badam pista laddu','dry fruit laddu']::text[]),
(173,'round',array['cream']::text[],'room',array['ghee','cardamom']::text[],false,false,false,15,array['nankhatai','nan khatai']::text[]),
(174,'round',array['yellow']::text[],'room',array['cashew','saffron']::text[],false,false,false,10,array['kaju modak','cashew modak']::text[]),
(175,'square',array['white','brown']::text[],'room',array['coconut','khoya','nuts']::text[],false,false,false,7,array['dilkhush','coconut barfi']::text[]),
(176,'diamond',array['golden','brown']::text[],'room',array['pistachio','walnut','butter']::text[],true,false,false,15,array['baklava','turkish baklava']::text[]),
(177,'round',array['golden','green']::text[],'warm',array['cheese','butter','pistachio']::text[],true,true,false,2,array['kunafa','kanafeh']::text[]),
(178,'square',array['pink','white']::text[],'room',array['rose','pistachio']::text[],false,false,false,20,array['turkish delight','lokum']::text[]),
(179,'round',array['white','pink']::text[],'room',array['rice','red bean']::text[],false,true,false,2,array['mochi','japanese mochi']::text[]),
(180,'round',array['white','red']::text[],'room',array['rice','red bean','strawberry']::text[],false,true,false,1,array['strawberry daifuku','daifuku']::text[]),
(181,'round',array['brown']::text[],'room',array['rice','soy sauce']::text[],true,false,false,1,array['mitarashi dango','dango']::text[]),
(182,'round',array['brown']::text[],'room',array['honey','red bean']::text[],false,true,false,2,array['dorayaki']::text[]),
(183,'roll',array['green','white']::text[],'cold',array['matcha','cream']::text[],false,true,false,3,array['swiss roll','matcha roll','green tea roll','japanese roll']::text[]),
(184,'round',array['brown','golden']::text[],'room',array['lotus seed','egg yolk']::text[],false,true,false,10,array['moon cake','chinese mooncake','yuebing']::text[]),
(185,'round',array['yellow','golden']::text[],'warm',array['egg','custard','pastry']::text[],false,true,false,2,array['dan tat','hong kong egg tart','custard tart']::text[]),
(186,'round',array['white']::text[],'warm',array['sesame','rice']::text[],false,true,false,2,array['tang yuan','glutinous rice balls','sweet dumplings']::text[]),
(187,'round',array['brown']::text[],'warm',array['cinnamon','brown sugar','nuts']::text[],false,true,true,1,array['hotteok','korean pancake','sweet pancake']::text[]),
(188,'bowl',array['white','red']::text[],'cold',array['milk','red bean','condensed milk']::text[],false,false,false,1,array['patbingsu','korean shaved ice','bingsu']::text[]),
(189,'irregular',array['yellow','white']::text[],'room',array['mango','coconut','sticky rice']::text[],false,false,false,1,array['mango rice','thai sticky rice']::text[]),
(190,'round',array['yellow','brown']::text[],'cold',array['egg','caramel','milk']::text[],true,false,false,3,array['leche flan','caramel custard','flan']::text[]),
(191,'bowl',array['purple','white','red']::text[],'cold',array['ube','milk','fruit']::text[],false,false,false,1,array['halo halo','halohalo']::text[]),
(192,'round',array['green','white']::text[],'room',array['pandan','palm sugar','coconut']::text[],false,true,false,1,array['onde onde','klepon']::text[]),
(193,'layered',array['green','white','pink']::text[],'room',array['pandan','coconut']::text[],false,false,false,2,array['kuih lapis','layered cake','nyonya kuih']::text[]),
(194,'long',array['brown']::text[],'warm',array['cinnamon','chocolate']::text[],false,false,true,1,array['churros','spanish fritters']::text[]),
(195,'bowl',array['yellow','brown']::text[],'cold',array['citrus','cinnamon','custard']::text[],false,false,false,2,array['crema catalana','catalan cream']::text[]),
(196,'square',array['white','brown']::text[],'room',array['almond','honey']::text[],false,false,false,20,array['turron','nougat']::text[]),
(197,'round',array['golden','brown']::text[],'warm',array['custard','cinnamon','pastry']::text[],false,true,false,2,array['pastel de nata','portuguese egg tart']::text[]),
(198,'round',array['pink','purple','white']::text[],'room',array['almond','ganache']::text[],false,true,false,5,array['macarons','french macarons']::text[]),
(199,'bowl',array['yellow','brown']::text[],'cold',array['vanilla','custard']::text[],false,false,false,2,array['creme brulee','burnt cream']::text[]),
(200,'long',array['brown','white']::text[],'cold',array['chocolate','cream','pastry']::text[],false,true,false,2,array['eclair','chocolate eclair']::text[]),
(201,'irregular',array['golden']::text[],'room',array['lemon','butter','egg']::text[],false,false,false,3,array['madeleine','shell cake']::text[]),
(202,'round',array['brown','red']::text[],'warm',array['apple','butter','caramel']::text[],false,false,false,2,array['tarte tatin','upside down apple tart']::text[]),
(203,'square',array['brown','white']::text[],'cold',array['coffee','mascarpone','cocoa']::text[],false,false,false,2,array['tiramisu']::text[]),
(204,'cylinder',array['brown','green']::text[],'cold',array['ricotta','pistachio']::text[],false,true,true,1,array['cannoli']::text[]),
(205,'bowl',array['white']::text[],'cold',array['vanilla','cream']::text[],false,false,false,2,array['panna cotta']::text[]),
(206,'bowl',array['green']::text[],'cold',array['pistachio','milk']::text[],false,false,false,1,array['pistachio gelato','pistachio ice cream']::text[]),
(207,'layered',array['golden']::text[],'warm',array['ricotta','orange','semolina']::text[],false,true,false,2,array['sfogliatella','lobster tail pastry']::text[]),
(208,'square',array['golden']::text[],'room',array['semolina','custard']::text[],true,true,false,3,array['galaktoboureko','greek custard pie']::text[]),
(209,'round',array['golden']::text[],'warm',array['honey','cinnamon','walnut']::text[],true,false,true,2,array['loukoumades','greek donuts']::text[]),
(210,'square',array['golden','brown']::text[],'room',array['semolina','coconut']::text[],true,false,false,5,array['basbousa','namoura','revani']::text[]),
(211,'bowl',array['brown','white']::text[],'warm',array['milk','nuts','raisins']::text[],false,false,false,1,array['umm ali','om ali']::text[]),
(212,'round',array['golden']::text[],'room',array['dates','walnut','pistachio']::text[],false,true,false,10,array['maamoul','mamoul']::text[]),
(213,'square',array['brown','white']::text[],'room',array['tahini','sesame','pistachio']::text[],false,false,false,20,array['tahini halva','sesame halva','halawa','halvah']::text[]),
(214,'round',array['golden','white']::text[],'warm',array['pancake','cream','nuts']::text[],true,true,false,2,array['qatayef','katayef','atayef','arab pancakes']::text[]),
(215,'round',array['golden']::text[],'warm',array['date syrup','sesame','saffron']::text[],true,false,true,2,array['luqaimat','lokma','luqma','sweet dumplings']::text[]),
(216,'bowl',array['yellow']::text[],'room',array['rice','saffron','rose water']::text[],false,false,false,3,array['sholeh zard','persian saffron rice pudding']::text[]),
(217,'square',array['white','green']::text[],'room',array['pistachio','rose water','egg white']::text[],false,false,false,15,array['gaz','persian nougat','gaz nougat']::text[]),
(218,'round',array['brown']::text[],'room',array['condensed milk','cocoa','butter']::text[],false,false,false,5,array['brigadeiro','brazilian chocolate truffle']::text[]),
(219,'round',array['yellow']::text[],'cold',array['egg yolk','coconut']::text[],false,false,false,3,array['quindim','brazilian coconut custard']::text[]),
(220,'round',array['brown','white']::text[],'room',array['cornflour','dulce de leche','coconut']::text[],false,true,false,10,array['alfajores','alfajor','argentine cookies']::text[]),
(221,'bowl',array['brown']::text[],'room',array['milk','vanilla']::text[],false,false,false,10,array['dulce de leche','milk caramel']::text[]),
(222,'square',array['white','yellow']::text[],'cold',array['sponge','milk','cream']::text[],true,false,false,2,array['tres leches','three milks cake']::text[]),
(223,'round',array['white','brown']::text[],'warm',array['sweet bread']::text[],false,false,false,3,array['conchas','mexican sweet bread']::text[]),
(224,'round',array['white','yellow']::text[],'cold',array['cream cheese','biscuit']::text[],false,false,false,3,array['ny cheesecake','new york cheesecake']::text[]),
(225,'square',array['brown']::text[],'warm',array['chocolate','butter']::text[],false,false,false,5,array['fudge brownie','chocolate brownie']::text[]),
(226,'square',array['brown']::text[],'warm',array['chocolate','butter','condensed milk']::text[],false,false,false,5,array['eggless brownie','veg brownie']::text[]),
(227,'round',array['brown','golden']::text[],'warm',array['apple','cinnamon','pastry','butter']::text[],false,true,false,3,array['apple pie']::text[]),
(228,'round',array['brown']::text[],'room',array['pecan','butter']::text[],true,true,false,5,array['pecan pie']::text[]),
(229,'square',array['brown']::text[],'warm',array['dates','toffee','butter']::text[],true,false,false,3,array['sticky toffee pudding']::text[]),
(230,'round',array['golden','red']::text[],'warm',array['butter','jam','cream']::text[],false,false,false,2,array['scones','cream tea']::text[]),
(231,'round',array['brown']::text[],'room',array['chocolate','apricot jam']::text[],false,true,false,5,array['sachertorte','sacher cake']::text[]),
(232,'long',array['brown']::text[],'warm',array['apple','cinnamon','raisins']::text[],false,true,false,3,array['apfelstrudel','apple strudel']::text[]),
(233,'round',array['brown','white','red']::text[],'cold',array['chocolate','cream','cherries']::text[],false,true,false,2,array['black forest cake','schwarzwälder kirschtorte']::text[]),
(234,'long',array['brown','white']::text[],'room',array['dried fruit','marzipan']::text[],false,true,false,15,array['stollen','german christmas bread']::text[]),
(235,'round',array['white','red']::text[],'cold',array['meringue','cream','fruit']::text[],false,false,false,1,array['pavlova']::text[]),
(236,'square',array['brown','white']::text[],'room',array['sponge','chocolate','coconut']::text[],false,false,false,5,array['lamington']::text[]),
(237,'round',array['brown','white']::text[],'cold',array['honey','sour cream']::text[],false,false,false,3,array['medovik','honey cake']::text[]),
(238,'square',array['white','brown']::text[],'cold',array['puff pastry','custard']::text[],false,true,false,2,array['napoleon cake','mille-feuille']::text[]),
(239,'round',array['white','green']::text[],'room',array['milk powder','pistachio','rose water']::text[],false,false,false,5,array['sheer pira','afghan milk fudge']::text[]),
(240,'bowl',array['brown']::text[],'cold',array['coconut milk','jaggery','cardamom','cashew']::text[],false,false,false,2,array['watalappam','vattalappam']::text[]),
(241,'round',array['white','brown']::text[],'warm',array['rice flour','jaggery','sesame']::text[],false,true,false,2,array['yomari']::text[]),
(242,'spiral',array['golden']::text[],'warm',array['rice flour','ghee','banana']::text[],false,false,true,3,array['sel roti','nepali rice donut']::text[]),
(243,'long',array['pink','white','yellow']::text[],'room',array['milk','rose']::text[],true,false,false,2,array['cham cham','chom chom','chum chum','tangail chomchom','bangladeshi chomchom']::text[]),
(244,'square',array['brown','dark-brown']::text[],'warm',array['apricot','cream','sponge','butter']::text[],true,false,false,3,array['malva','south african pudding','malva cake','apricot pudding']::text[])
) as t(id, shape, colours, served_temp, key_flavours, has_syrup, has_filling, is_fried, shelf, aliases)
where s.id = t.id;

-- Namkeen catalog (42 items). Generated by scratch namkeen.py; images from Wikipedia/Wikimedia Commons.
insert into public.sweets (slug,name,name_hi,description,origin_story,region,country,category,base,ingredients,sweetness,richness,texture,tags,occasions,is_sugar_free,is_vegan,is_jain,is_eggless,is_gluten_free,allergens,price_unit,base_price,rating,rating_count,popularity,is_new,is_festive,in_stock,image_url,image_credit,product_type,shelf_life_days,spice_level,taste_tags,served_temp,colours,is_fried) values
('aloo-bhujia','Aloo Bhujia','आलू भुजिया','Thin crunchy sev of besan and potato, spiced with black pepper and mint — the Bikaneri classic.','A namkeen favourite at Swaad Sujhaav.','Rajasthan','India','namkeen','besan',array['besan','potato']::text[],1,1,'crunchy',array['bestseller','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,false,'{}'::text[],'250g',70,4.6,75,37,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/Shop_selling_Bikaneri_bhujia_in_Jaipur.jpg/500px-Shop_selling_Bikaneri_bhujia_in_Jaipur.jpg','Wikimedia Commons','namkeen',60,2,array['spicy','crunchy']::text[],'room',array['yellow']::text[],false),
('bikaneri-bhujia','Bikaneri Bhujia','बीकानेरी भुजिया','Moth-bean and besan sev from Bikaner with a peppery kick.','A namkeen favourite at Swaad Sujhaav.','Rajasthan','India','namkeen','moth dal',array['moth dal']::text[],1,1,'crunchy',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,false,'{}'::text[],'250g',80,4.3,97,65,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/Shop_selling_Bikaneri_bhujia_in_Jaipur.jpg/500px-Shop_selling_Bikaneri_bhujia_in_Jaipur.jpg','Wikimedia Commons','namkeen',60,3,array['spicy','crunchy']::text[],'room',array['golden']::text[],false),
('moong-dal-namkeen','Moong Dal Namkeen','मूंग दाल नमकीन','Fried yellow moong dal with just salt — light, crunchy and loved by kids.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','moong dal',array['moong dal']::text[],1,1,'crunchy',array['kids','namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,true,'{}'::text[],'250g',75,4.5,53,79,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/86/Mung_beans_%28Vigna_radiata%29.jpg/500px-Mung_beans_%28Vigna_radiata%29.jpg','Wikimedia Commons','namkeen',60,0,array['mild','crunchy','salty']::text[],'room',array['yellow']::text[],false),
('khatta-meetha-mixture','Khatta Meetha Mixture','खट्टा मीठा','Sweet-and-sour mix of sev, boondi, peanuts, raisins and cornflakes.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','besan',array['besan','peanuts']::text[],1,1,'crunchy',array['kids','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,false,array['peanuts']::text[],'250g',70,4.2,47,37,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c6/Bombaymix.jpg/500px-Bombaymix.jpg','Wikimedia Commons','namkeen',45,1,array['tangy','sweet','crunchy']::text[],'room',array['yellow']::text[],false),
('navratan-mixture','Navratan Mixture','नवरतन मिक्सचर','Nine-jewel mix of sev, dal, peanuts, cashews and curry leaves.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','besan',array['besan','peanuts']::text[],1,1,'crunchy',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,false,array['peanuts','cashew']::text[],'250g',80,4.4,42,72,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c6/Bombaymix.jpg/500px-Bombaymix.jpg','Wikimedia Commons','namkeen',45,2,array['spicy','crunchy']::text[],'room',array['yellow']::text[],false),
('mathri-namkeen','Mathri','मठरी','Flaky ajwain-flecked flour crackers, the perfect partner for chai and achaar.','A namkeen favourite at Swaad Sujhaav.','Punjab','India','namkeen','flour',array['flour']::text[],1,1,'flaky',array['chai-time','namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,false,array['gluten']::text[],'250g',60,4.8,57,72,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/Mathri.JPG/500px-Mathri.JPG','Wikimedia Commons','namkeen',30,1,array['mild','flaky','salty']::text[],'room',array['golden']::text[],false),
('methi-mathri','Methi Mathri','मेथी मठरी','Mathri with dried fenugreek leaves for a gentle bitter-savoury note.','A namkeen favourite at Swaad Sujhaav.','Punjab','India','namkeen','flour',array['flour']::text[],1,1,'flaky',array['chai-time','namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,false,array['gluten']::text[],'250g',65,4.7,48,44,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/Mathri.JPG/500px-Mathri.JPG','Wikimedia Commons','namkeen',30,1,array['herby','flaky']::text[],'room',array['golden']::text[],false),
('namak-pare','Namak Pare','नमक पारे','Diamond-cut salted flour bites fried crisp — a Deepawali tin essential.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','flour',array['flour']::text[],1,1,'crunchy',array['diwali','namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,false,array['gluten']::text[],'250g',55,4.5,51,30,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Shankarpali_sweets_mithai_Western_India_2012.jpg/500px-Shankarpali_sweets_mithai_Western_India_2012.jpg','Wikimedia Commons','namkeen',30,0,array['mild','crunchy','salty']::text[],'room',array['golden']::text[],false),
('shakarpara','Shakarpara','शक्करपारा','Sweet-savoury diamonds of fried dough glazed with sugar.','A namkeen favourite at Swaad Sujhaav.','Maharashtra','India','namkeen','flour',array['flour']::text[],1,1,'crunchy',array['diwali','namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,false,array['gluten']::text[],'250g',60,4.5,96,30,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Shankarpali_sweets_mithai_Western_India_2012.jpg/500px-Shankarpali_sweets_mithai_Western_India_2012.jpg','Wikimedia Commons','namkeen',30,0,array['sweet','crunchy']::text[],'room',array['golden']::text[],false),
('chakli','Chakli','चकली','Spiral rice-and-dal crunchies with sesame and red chilli.','A namkeen favourite at Swaad Sujhaav.','Maharashtra','India','namkeen','rice',array['rice']::text[],1,1,'crunchy',array['diwali','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,true,array['sesame']::text[],'250g',75,4.8,97,72,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9a/Chakli_in_a_bowl.jpg/500px-Chakli_in_a_bowl.jpg','Wikimedia Commons','namkeen',30,2,array['spicy','crunchy']::text[],'room',array['golden']::text[],false),
('murukku','Murukku','मुरुक्कु','Tamil-style rice murukku with cumin, pressed into crisp spirals.','A namkeen favourite at Swaad Sujhaav.','South India','India','namkeen','rice',array['rice']::text[],1,1,'crunchy',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,true,'{}'::text[],'250g',75,4.2,44,79,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/A_Traditional_Tamil_Snack_Murukku.jpg/500px-A_Traditional_Tamil_Snack_Murukku.jpg','Wikimedia Commons','namkeen',30,1,array['crunchy','salty']::text[],'room',array['golden']::text[],false),
('ribbon-pakoda','Ribbon Pakoda','रिबन पकोड़ा','Flat ribbons of rice and besan dough, fried golden with chilli.','A namkeen favourite at Swaad Sujhaav.','South India','India','namkeen','rice',array['rice']::text[],1,1,'crunchy',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,true,'{}'::text[],'250g',70,4.8,43,51,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cf/Onion_pakora_-_a.jpg/500px-Onion_pakora_-_a.jpg','Wikimedia Commons','namkeen',30,2,array['spicy','crunchy']::text[],'room',array['golden']::text[],false),
('banana-chips','Banana Chips','केले के चिप्स','Kerala raw-banana chips fried in coconut oil.','A namkeen favourite at Swaad Sujhaav.','Kerala','India','namkeen','banana',array['banana']::text[],1,1,'crunchy',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,true,'{}'::text[],'250g',90,4.7,85,44,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/be/Chips_de_bananes_de_S%C3%A3o_Tom%C3%A9-et-Pr%C3%ADncipe.jpg/500px-Chips_de_bananes_de_S%C3%A3o_Tom%C3%A9-et-Pr%C3%ADncipe.jpg','Wikimedia Commons','namkeen',30,0,array['mild','crunchy','salty']::text[],'room',array['golden']::text[],false),
('masala-banana-chips','Masala Banana Chips','मसाला केला चिप्स','Banana chips tossed in pepper and chilli masala.','A namkeen favourite at Swaad Sujhaav.','Kerala','India','namkeen','banana',array['banana']::text[],1,1,'crunchy',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,true,'{}'::text[],'250g',95,4.7,88,93,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/be/Chips_de_bananes_de_S%C3%A3o_Tom%C3%A9-et-Pr%C3%ADncipe.jpg/500px-Chips_de_bananes_de_S%C3%A3o_Tom%C3%A9-et-Pr%C3%ADncipe.jpg','Wikimedia Commons','namkeen',30,2,array['spicy','crunchy']::text[],'room',array['golden']::text[],false),
('kachori','Kachori','कचौरी','Flaky fried pastry stuffed with spiced moong dal — best eaten warm.','A namkeen favourite at Swaad Sujhaav.','Rajasthan','India','namkeen','flour',array['flour']::text[],1,1,'flaky',array['breakfast','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,false,array['gluten']::text[],'250g',60,4.2,47,79,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Rajasthani_Raj_Kachori.jpg/500px-Rajasthani_Raj_Kachori.jpg','Wikimedia Commons','namkeen',2,2,array['spicy','flaky','hot']::text[],'warm',array['golden']::text[],true),
('pyaaz-kachori','Pyaaz Kachori','प्याज कचौरी','Jodhpur''s onion-filled kachori with a tangy-spicy masala.','A namkeen favourite at Swaad Sujhaav.','Rajasthan','India','namkeen','flour',array['flour']::text[],1,1,'flaky',array['breakfast','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,false,array['gluten']::text[],'250g',70,4.8,97,51,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Rajasthani_Raj_Kachori.jpg/500px-Rajasthani_Raj_Kachori.jpg','Wikimedia Commons','namkeen',2,2,array['spicy','flaky','hot']::text[],'warm',array['golden']::text[],true),
('khasta-kachori','Khasta Kachori','खस्ता कचौरी','Small khasta kachoris with urad dal filling that keep for days.','A namkeen favourite at Swaad Sujhaav.','Uttar Pradesh','India','namkeen','flour',array['flour']::text[],1,1,'flaky',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,false,array['gluten']::text[],'250g',65,4.2,43,58,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Rajasthani_Raj_Kachori.jpg/500px-Rajasthani_Raj_Kachori.jpg','Wikimedia Commons','namkeen',5,2,array['spicy','flaky']::text[],'room',array['golden']::text[],false),
('samosa','Samosa','समोसा','Triangular crisp pastry filled with spiced potato and peas.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','flour',array['flour']::text[],1,1,'crisp',array['bestseller','chai-time','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,false,array['gluten']::text[],'250g',50,4.8,99,72,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Samosas%2C_snack_food_at_Wikipedia%27s_16th_Birthday_celebration_in_Chittagong_%2801%29.jpg/500px-Samosas%2C_snack_food_at_Wikipedia%27s_16th_Birthday_celebration_in_Chittagong_%2801%29.jpg','Wikimedia Commons','namkeen',1,2,array['spicy','crisp','hot']::text[],'warm',array['golden']::text[],true),
('paneer-samosa','Paneer Samosa','पनीर समोसा','Samosa filled with spiced paneer and capsicum.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','flour',array['flour']::text[],1,1,'crisp',array['namkeen']::text[],array['guests','diwali','office']::text[],true,false,false,true,false,array['milk','gluten']::text[],'250g',60,4.8,86,51,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Samosas%2C_snack_food_at_Wikipedia%27s_16th_Birthday_celebration_in_Chittagong_%2801%29.jpg/500px-Samosas%2C_snack_food_at_Wikipedia%27s_16th_Birthday_celebration_in_Chittagong_%2801%29.jpg','Wikimedia Commons','namkeen',1,1,array['mild','crisp','hot']::text[],'warm',array['golden']::text[],true),
('dhokla','Dhokla','ढोकला','Steamed spongy besan cake tempered with mustard seeds and green chilli.','A namkeen favourite at Swaad Sujhaav.','Gujarat','India','namkeen','besan',array['besan']::text[],1,1,'soft',array['healthy','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,true,'{}'::text[],'250g',70,4.8,51,72,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/65/Dhokla_on_Gujrart.jpg/500px-Dhokla_on_Gujrart.jpg','Wikimedia Commons','namkeen',1,1,array['tangy','soft','mild']::text[],'room',array['yellow']::text[],false),
('khaman','Khaman','खमण','Extra-soft Gujarati khaman with a sweet-tangy tempering.','A namkeen favourite at Swaad Sujhaav.','Gujarat','India','namkeen','besan',array['besan']::text[],1,1,'soft',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,true,'{}'::text[],'250g',70,4.8,96,72,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6f/SPECIAL_SURATI_KHAMAN.jpg/500px-SPECIAL_SURATI_KHAMAN.jpg','Wikimedia Commons','namkeen',1,1,array['tangy','soft']::text[],'room',array['yellow']::text[],false),
('khandvi','Khandvi','खांडवी','Silky besan rolls with coconut, coriander and mustard tadka.','A namkeen favourite at Swaad Sujhaav.','Gujarat','India','namkeen','besan',array['besan']::text[],1,1,'soft',array['healthy','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,true,array['coconut']::text[],'250g',90,4.2,40,79,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bf/Gate_of_Khandvi.jpg/500px-Gate_of_Khandvi.jpg','Wikimedia Commons','namkeen',1,1,array['tangy','soft','mild']::text[],'cold',array['yellow']::text[],false),
('fafda','Fafda','फाफड़ा','Long crunchy besan strips with ajwain — Dussehra''s jodi with jalebi.','A namkeen favourite at Swaad Sujhaav.','Gujarat','India','namkeen','besan',array['besan']::text[],1,1,'crunchy',array['dussehra','namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,true,'{}'::text[],'250g',70,4.7,48,65,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/66/Ghatiya_2013-11-30_18-09.jpg/500px-Ghatiya_2013-11-30_18-09.jpg','Wikimedia Commons','namkeen',3,1,array['crunchy','salty']::text[],'room',array['yellow']::text[],false),
('gathiya','Gathiya','गाठिया','Thick soft-crunch besan gathiya with pepper and ajwain.','A namkeen favourite at Swaad Sujhaav.','Gujarat','India','namkeen','besan',array['besan']::text[],1,1,'crunchy',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,true,'{}'::text[],'250g',65,4.2,95,79,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/66/Ghatiya_2013-11-30_18-09.jpg/500px-Ghatiya_2013-11-30_18-09.jpg','Wikimedia Commons','namkeen',45,1,array['crunchy','mild']::text[],'room',array['yellow']::text[],false),
('khakhra','Khakhra','खाखरा','Roasted thin wheat crackers with methi — not fried at all.','A namkeen favourite at Swaad Sujhaav.','Gujarat','India','namkeen','wheat',array['wheat']::text[],1,1,'crisp',array['healthy','namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,false,array['gluten']::text[],'250g',80,4.2,98,79,false,false,true,'https://upload.wikimedia.org/wikipedia/commons/c/c6/Khakhra_br%C3%B6d.png_unscaled','Wikimedia Commons','namkeen',60,1,array['crisp','healthy']::text[],'room',array['golden']::text[],false),
('bhakarwadi','Bhakarwadi','भाकरवड़ी','Pune-style spirals with a sweet-spicy coconut and sesame filling.','A namkeen favourite at Swaad Sujhaav.','Maharashtra','India','namkeen','besan',array['besan']::text[],1,1,'crunchy',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,false,array['sesame','gluten']::text[],'250g',85,4.5,45,30,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fd/Bhakarwadi.JPG/500px-Bhakarwadi.JPG','Wikimedia Commons','namkeen',30,2,array['spicy','sweet','crunchy']::text[],'room',array['yellow']::text[],false),
('chivda','Chivda','चिवड़ा','Light roasted poha chivda with peanuts, curry leaves and turmeric.','A namkeen favourite at Swaad Sujhaav.','Maharashtra','India','namkeen','poha',array['poha','peanuts']::text[],1,1,'crunchy',array['healthy','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,true,array['peanuts']::text[],'250g',65,4.8,46,72,false,false,true,null,null,'namkeen',30,1,array['mild','crunchy']::text[],'room',array['golden']::text[],false),
('cornflakes-mixture','Cornflakes Mixture','कॉर्नफ्लेक्स मिक्सचर','Crunchy cornflakes, peanuts and raisins with a hint of sugar.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','corn',array['corn','peanuts']::text[],1,1,'crunchy',array['kids','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,true,array['peanuts']::text[],'250g',75,4.6,41,86,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c6/Bombaymix.jpg/500px-Bombaymix.jpg','Wikimedia Commons','namkeen',30,1,array['sweet','crunchy']::text[],'room',array['golden']::text[],false),
('masala-peanuts','Masala Peanuts','मसाला मूंगफली','Besan-coated peanuts fried crisp with chaat masala.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','peanuts',array['peanuts','peanuts']::text[],1,1,'crunchy',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,true,array['peanuts']::text[],'250g',60,4.2,91,58,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a4/Arachis_hypogaea_-_K%C3%B6hler%E2%80%93s_Medizinal-Pflanzen-163.jpg/500px-Arachis_hypogaea_-_K%C3%B6hler%E2%80%93s_Medizinal-Pflanzen-163.jpg','Wikimedia Commons','namkeen',45,2,array['spicy','crunchy']::text[],'room',array['golden']::text[],false),
('kaju-masala','Kaju Masala','काजू मसाला','Roasted cashews in pepper-chilli masala — a premium gifting namkeen.','A namkeen favourite at Swaad Sujhaav.','Goa','India','namkeen','cashew',array['cashew']::text[],1,2,'crunchy',array['gifting','namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,true,array['cashew']::text[],'250g',220,4.6,48,37,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/64/Cashew_apples.jpg/500px-Cashew_apples.jpg','Wikimedia Commons','namkeen',45,2,array['spicy','crunchy','rich']::text[],'room',array['golden']::text[],false),
('ratlami-sev','Ratlami Sev','रतलामी सेव','Fiery Ratlam sev with cloves and black pepper.','A namkeen favourite at Swaad Sujhaav.','Madhya Pradesh','India','namkeen','besan',array['besan']::text[],1,1,'crunchy',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,true,'{}'::text[],'250g',70,4.6,86,37,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d9/Sev_2013-12-01_16-57.jpg/500px-Sev_2013-12-01_16-57.jpg','Wikimedia Commons','namkeen',45,3,array['spicy','crunchy']::text[],'room',array['yellow']::text[],false),
('plain-sev','Plain Sev','सेव','Fine besan sev with ajwain, mild enough for everyone.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','besan',array['besan']::text[],1,1,'crunchy',array['kids','namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,true,'{}'::text[],'250g',60,4.4,93,93,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d9/Sev_2013-12-01_16-57.jpg/500px-Sev_2013-12-01_16-57.jpg','Wikimedia Commons','namkeen',45,0,array['mild','crunchy','salty']::text[],'room',array['yellow']::text[],false),
('soya-sticks','Soya Sticks','सोया स्टिक्स','Crunchy soya sticks with a light masala dusting.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','soya',array['soya']::text[],1,1,'crunchy',array['healthy','namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,true,array['soy']::text[],'250g',70,4.6,88,37,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Textured_vegetable_protein.jpg/500px-Textured_vegetable_protein.jpg','Wikimedia Commons','namkeen',45,1,array['crunchy','healthy']::text[],'room',array['golden']::text[],false),
('makhana-masala','Makhana Masala','मखाना मसाला','Roasted fox nuts in ghee with pink salt and pepper.','A namkeen favourite at Swaad Sujhaav.','Bihar','India','namkeen','lotus seed',array['lotus seed']::text[],1,1,'crunchy',array['healthy','fasting','namkeen']::text[],array['guests','diwali','office']::text[],true,false,true,true,true,array['milk']::text[],'250g',160,4.2,91,58,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/Junicho-Gata_lagoon_Euryale_feroxe_habitat_07.jpg/500px-Junicho-Gata_lagoon_Euryale_feroxe_habitat_07.jpg','Wikimedia Commons','namkeen',30,1,array['mild','crunchy','healthy']::text[],'room',array['golden']::text[],false),
('aloo-lachha','Aloo Lachha','आलू लच्छा','Shoestring potato lachha with peanuts — a vrat favourite.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','potato',array['potato','potato','peanuts']::text[],1,1,'crunchy',array['fasting','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,true,array['peanuts']::text[],'250g',70,4.6,97,37,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/69/Potato-Chips.jpg/500px-Potato-Chips.jpg','Wikimedia Commons','namkeen',30,1,array['crunchy','salty']::text[],'room',array['golden']::text[],false),
('chana-jor-garam','Chana Jor Garam','चना जोर गरम','Flattened roasted chana with lemon, onion masala — street-side nostalgia.','A namkeen favourite at Swaad Sujhaav.','Uttar Pradesh','India','namkeen','chana',array['chana']::text[],1,1,'crunchy',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,true,'{}'::text[],'250g',60,4.3,53,65,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/89/Chickpea_BNC.jpg/500px-Chickpea_BNC.jpg','Wikimedia Commons','namkeen',30,2,array['spicy','tangy','crunchy']::text[],'room',array['golden']::text[],false),
('dal-moth','Dal Moth','दालमोठ','Agra''s dal moth: fried lentils with peanuts and spices.','A namkeen favourite at Swaad Sujhaav.','Uttar Pradesh','India','namkeen','lentil',array['lentil','peanuts']::text[],1,1,'crunchy',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,true,array['peanuts']::text[],'250g',75,4.3,95,86,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c6/Bombaymix.jpg/500px-Bombaymix.jpg','Wikimedia Commons','namkeen',45,2,array['spicy','crunchy']::text[],'room',array['golden']::text[],false),
('thepla-chips','Thepla Chips','थेपला चिप्स','Methi-thepla dough baked into crisp chips.','A namkeen favourite at Swaad Sujhaav.','Gujarat','India','namkeen','wheat',array['wheat']::text[],1,1,'crisp',array['healthy','namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,false,array['gluten']::text[],'250g',80,4.7,82,44,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/74/Thepla_main.jpg/500px-Thepla_main.jpg','Wikimedia Commons','namkeen',30,1,array['herby','crisp']::text[],'room',array['golden']::text[],false),
('mini-samosa','Mini Samosa','मिनी समोसा','Bite-size dry samosas with a spiced dal filling — long shelf life.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','flour',array['flour']::text[],1,1,'crunchy',array['chai-time','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,false,array['gluten']::text[],'250g',75,4.6,46,37,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Samosas%2C_snack_food_at_Wikipedia%27s_16th_Birthday_celebration_in_Chittagong_%2801%29.jpg/500px-Samosas%2C_snack_food_at_Wikipedia%27s_16th_Birthday_celebration_in_Chittagong_%2801%29.jpg','Wikimedia Commons','namkeen',30,1,array['crunchy','spicy']::text[],'room',array['golden']::text[],false),
('nimki','Nimki','निमकी','Bengali kalonji-flecked flaky crackers.','A namkeen favourite at Swaad Sujhaav.','Bengal','India','namkeen','flour',array['flour']::text[],1,1,'flaky',array['chai-time','namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,false,array['gluten']::text[],'250g',60,4.7,79,65,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/48/Namak_paray_made_at_home.jpg/500px-Namak_paray_made_at_home.jpg','Wikimedia Commons','namkeen',30,0,array['mild','flaky','salty']::text[],'room',array['golden']::text[],false),
('kachri-papad','Kachri Papad','पापड़','Roasted urad papad with black pepper, ready to munch.','A namkeen favourite at Swaad Sujhaav.','Rajasthan','India','namkeen','lentil',array['lentil']::text[],1,1,'crisp',array['namkeen']::text[],array['guests','diwali','office']::text[],true,true,true,true,true,'{}'::text[],'250g',70,4.7,93,44,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/09/Roasted_Papad_-_Howrah_2013-11-02_4068.jpg/500px-Roasted_Papad_-_Howrah_2013-11-02_4068.jpg','Wikimedia Commons','namkeen',60,2,array['spicy','crisp']::text[],'room',array['golden']::text[],false),
('shahi-mixture','Shahi Mixture','शाही मिक्सचर','Premium mix with cashews, almonds, makhana and sev.','A namkeen favourite at Swaad Sujhaav.','North India','India','namkeen','dry-fruit',array['dry-fruit']::text[],1,2,'crunchy',array['gifting','namkeen']::text[],array['guests','diwali','office']::text[],true,true,false,true,false,array['cashew','almond']::text[],'250g',140,4.8,91,51,false,false,true,'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c6/Bombaymix.jpg/500px-Bombaymix.jpg','Wikimedia Commons','namkeen',30,1,array['rich','crunchy']::text[],'room',array['golden']::text[],false)
on conflict (slug) do nothing;
insert into public.sweet_variants (sweet_id, weight_label, grams, price, stock_qty, sort_order)
select s.id, v.label, v.grams, v.price, v.stock, v.ord from (values
('aloo-bhujia','250g',250,70,40,1),
('aloo-bhujia','500g',500,133,25,2),
('aloo-bhujia','1kg',1000,252,12,3),
('bikaneri-bhujia','250g',250,80,40,1),
('bikaneri-bhujia','500g',500,152,25,2),
('bikaneri-bhujia','1kg',1000,288,12,3),
('moong-dal-namkeen','250g',250,75,40,1),
('moong-dal-namkeen','500g',500,142,25,2),
('moong-dal-namkeen','1kg',1000,270,12,3),
('khatta-meetha-mixture','250g',250,70,40,1),
('khatta-meetha-mixture','500g',500,133,25,2),
('khatta-meetha-mixture','1kg',1000,252,12,3),
('navratan-mixture','250g',250,80,40,1),
('navratan-mixture','500g',500,152,25,2),
('navratan-mixture','1kg',1000,288,12,3),
('mathri-namkeen','250g',250,60,40,1),
('mathri-namkeen','500g',500,114,25,2),
('mathri-namkeen','1kg',1000,216,12,3),
('methi-mathri','250g',250,65,40,1),
('methi-mathri','500g',500,124,25,2),
('methi-mathri','1kg',1000,234,12,3),
('namak-pare','250g',250,55,40,1),
('namak-pare','500g',500,104,25,2),
('namak-pare','1kg',1000,198,12,3),
('shakarpara','250g',250,60,40,1),
('shakarpara','500g',500,114,25,2),
('shakarpara','1kg',1000,216,12,3),
('chakli','250g',250,75,40,1),
('chakli','500g',500,142,25,2),
('chakli','1kg',1000,270,12,3),
('murukku','250g',250,75,40,1),
('murukku','500g',500,142,25,2),
('murukku','1kg',1000,270,12,3),
('ribbon-pakoda','250g',250,70,40,1),
('ribbon-pakoda','500g',500,133,25,2),
('ribbon-pakoda','1kg',1000,252,12,3),
('banana-chips','250g',250,90,40,1),
('banana-chips','500g',500,171,25,2),
('banana-chips','1kg',1000,324,12,3),
('masala-banana-chips','250g',250,95,40,1),
('masala-banana-chips','500g',500,180,25,2),
('masala-banana-chips','1kg',1000,342,12,3),
('kachori','250g',250,60,40,1),
('kachori','500g',500,114,25,2),
('kachori','1kg',1000,216,12,3),
('pyaaz-kachori','250g',250,70,40,1),
('pyaaz-kachori','500g',500,133,25,2),
('pyaaz-kachori','1kg',1000,252,12,3),
('khasta-kachori','250g',250,65,40,1),
('khasta-kachori','500g',500,124,25,2),
('khasta-kachori','1kg',1000,234,12,3),
('samosa','250g',250,50,40,1),
('samosa','500g',500,95,25,2),
('samosa','1kg',1000,180,12,3),
('paneer-samosa','250g',250,60,40,1),
('paneer-samosa','500g',500,114,25,2),
('paneer-samosa','1kg',1000,216,12,3),
('dhokla','250g',250,70,40,1),
('dhokla','500g',500,133,25,2),
('dhokla','1kg',1000,252,12,3),
('khaman','250g',250,70,40,1),
('khaman','500g',500,133,25,2),
('khaman','1kg',1000,252,12,3),
('khandvi','250g',250,90,40,1),
('khandvi','500g',500,171,25,2),
('khandvi','1kg',1000,324,12,3),
('fafda','250g',250,70,40,1),
('fafda','500g',500,133,25,2),
('fafda','1kg',1000,252,12,3),
('gathiya','250g',250,65,40,1),
('gathiya','500g',500,124,25,2),
('gathiya','1kg',1000,234,12,3),
('khakhra','250g',250,80,40,1),
('khakhra','500g',500,152,25,2),
('khakhra','1kg',1000,288,12,3),
('bhakarwadi','250g',250,85,40,1),
('bhakarwadi','500g',500,162,25,2),
('bhakarwadi','1kg',1000,306,12,3),
('chivda','250g',250,65,40,1),
('chivda','500g',500,124,25,2),
('chivda','1kg',1000,234,12,3),
('cornflakes-mixture','250g',250,75,40,1),
('cornflakes-mixture','500g',500,142,25,2),
('cornflakes-mixture','1kg',1000,270,12,3),
('masala-peanuts','250g',250,60,40,1),
('masala-peanuts','500g',500,114,25,2),
('masala-peanuts','1kg',1000,216,12,3),
('kaju-masala','250g',250,220,40,1),
('kaju-masala','500g',500,418,25,2),
('kaju-masala','1kg',1000,792,12,3),
('ratlami-sev','250g',250,70,40,1),
('ratlami-sev','500g',500,133,25,2),
('ratlami-sev','1kg',1000,252,12,3),
('plain-sev','250g',250,60,40,1),
('plain-sev','500g',500,114,25,2),
('plain-sev','1kg',1000,216,12,3),
('soya-sticks','250g',250,70,40,1),
('soya-sticks','500g',500,133,25,2),
('soya-sticks','1kg',1000,252,12,3),
('makhana-masala','250g',250,160,40,1),
('makhana-masala','500g',500,304,25,2),
('makhana-masala','1kg',1000,576,12,3),
('aloo-lachha','250g',250,70,40,1),
('aloo-lachha','500g',500,133,25,2),
('aloo-lachha','1kg',1000,252,12,3),
('chana-jor-garam','250g',250,60,40,1),
('chana-jor-garam','500g',500,114,25,2),
('chana-jor-garam','1kg',1000,216,12,3),
('dal-moth','250g',250,75,40,1),
('dal-moth','500g',500,142,25,2),
('dal-moth','1kg',1000,270,12,3),
('thepla-chips','250g',250,80,40,1),
('thepla-chips','500g',500,152,25,2),
('thepla-chips','1kg',1000,288,12,3),
('mini-samosa','250g',250,75,40,1),
('mini-samosa','500g',500,142,25,2),
('mini-samosa','1kg',1000,270,12,3),
('nimki','250g',250,60,40,1),
('nimki','500g',500,114,25,2),
('nimki','1kg',1000,216,12,3),
('kachri-papad','250g',250,70,40,1),
('kachri-papad','500g',500,133,25,2),
('kachri-papad','1kg',1000,252,12,3),
('shahi-mixture','250g',250,140,40,1),
('shahi-mixture','500g',500,266,25,2),
('shahi-mixture','1kg',1000,504,12,3)) v(slug,label,grams,price,stock,ord) join public.sweets s on s.slug = v.slug on conflict (sweet_id, weight_label) do nothing;
update public.sweets set is_fried = false where product_type = 'namkeen' and slug in ('dhokla','khaman','khandvi','khakhra','chivda','makhana-masala','thepla-chips','kachri-papad','chana-jor-garam','soya-sticks');
update public.sweets set is_fried = true where product_type = 'namkeen' and slug not in ('dhokla','khaman','khandvi','khakhra','chivda','makhana-masala','thepla-chips','kachri-papad','chana-jor-garam','soya-sticks');

-- Photos that showed the raw ingredient (or the wrong thing) fall back to the designed placeholder.
update public.sweets set image_url = null, image_credit = null where slug in ('khandvi','moong-dal-namkeen','kaju-masala','makhana-masala','chana-jor-garam','masala-peanuts','khakhra','ribbon-pakoda');

-- Namkeen are savoury: never "sugar-free mithai", but fine for a sugar-free guest unless they are sweet-savoury.
update public.sweets set is_sugar_free = false where product_type = 'namkeen';
-- (fits_prefs is defined in migrations/002_feature_pack.sql)

-- Season tags used by the weather rules and the demand prediction.
update public.sweets set tags = array_append(tags, 'winter')
where name in ('Gajar Ka Halwa','Moong Dal Halwa','Gond Laddoo','Pinni','Panjiri','Til Laddoo','Gur Gajak','Tilkut','Methi Laddoo','Atta Ladoo','Badam Halwa','Sooji Halwa')
  and not ('winter' = any(tags));
update public.sweets set tags = array_append(tags, 'summer')
where name in ('Kulfi','Rabri','Shrikhand','Amrakhand','Mishti Doi','Phirni','Kesar Shrikhand','Mango Rasmalai','Basundi','Pistachio Gelato','Patbingsu','Halo-Halo')
  and not ('summer' = any(tags));

-- ---------------------------------------------------------------- festivals (next 12 months)
-- needs_confirmation = true where the lunar date may shift by a day; the owner confirms in Admin → Festivals.
insert into public.festivals (slug, name, name_hi, starts_on, lead_days, cutoff_hours, featured_tags, featured_categories, demand_multiplier, accent, emoji, greeting, needs_confirmation) values
 ('dussehra-2026', 'Dussehra', 'दशहरा', '2026-10-20', 7, 12, '{festive}', '{fried}', 1.5, '#FF6B1A', '🏹', 'Burai pe achhai ki jeet! Jalebi-fafda toh banta hai ji.', true),
 ('karwa-chauth-2026', 'Karwa Chauth', 'करवा चौथ', '2026-10-29', 7, 12, '{festive}', '{milk-based,dry-fruit}', 1.3, '#E6197A', '🌙', 'Sargi di thaali sajao ji!', true),
 ('dhanteras-2026', 'Dhanteras', 'धनतेरस', '2026-11-06', 14, 12, '{festive}', '{dry-fruit,barfi,laddoo}', 1.6, '#C8961E', '🪙', 'Dhanteras di shubhkaamnayein ji!', false),
 ('deepawali-2026', 'Deepawali', 'दीपावली', '2026-11-08', 21, 18, '{festive}', '{dry-fruit,barfi,laddoo,milk-based,bengali}', 1.9, '#FFB800', '🪔', 'Shubh Deepawali ji! Lakshmi Puja di mithai pehle hi book karo.', false),
 ('govardhan-2026', 'Govardhan Puja', 'गोवर्धन पूजा', '2026-11-09', 10, 12, '{festive}', '{milk-based,laddoo}', 1.3, '#8DC63F', '🐄', 'Annakoot di shubhkaamnayein!', true),
 ('bhai-dooj-2026', 'Bhai Dooj', 'भाई दूज', '2026-11-11', 10, 12, '{festive}', '{barfi,dry-fruit,bengali}', 1.5, '#E6197A', '🧿', 'Bhai-behen da pyaar, mithai naal!', true),
 ('chhath-2026', 'Chhath Puja', 'छठ पूजा', '2026-11-15', 10, 24, '{festive}', '{fried,laddoo}', 1.3, '#FF9933', '🌅', 'Chhathi Maiya di jai! Thekua tayyar hai.', true),
 ('guru-nanak-2026', 'Guru Nanak Jayanti', 'गुरु नानक जयंती', '2026-11-24', 7, 12, '{}', '{halwa,laddoo}', 1.3, '#FF9933', '🙏', 'Gurpurab diyan lakh lakh vadhaiyan! Kada prasad bhi hai ji.', true),
 ('christmas-2026', 'Christmas', 'क्रिसमस', '2026-12-25', 10, 12, '{}', '{world,baked}', 1.3, '#B3261E', '🎄', 'Merry Christmas ji! Plum cake nahi, par stollen zaroor hai.', false),
 ('lohri-2027', 'Lohri', 'लोहड़ी', '2027-01-13', 10, 12, '{winter}', '{brittle,laddoo}', 1.5, '#FF6B1A', '🔥', 'Lohri diyan vadhaiyan! Gajak, rewdi te til laddoo.', false),
 ('sankranti-2027', 'Makar Sankranti', 'मकर संक्रांति', '2027-01-14', 10, 12, '{winter}', '{brittle,laddoo}', 1.5, '#FFB800', '🪁', 'Til-gud ghya, god god bola!', true),
 ('holi-2027', 'Holi', 'होली', '2027-03-22', 14, 12, '{festive}', '{fried,milk-based}', 1.6, '#E6197A', '🎨', 'Bura na mano Holi hai! Gujiya leke jao ji.', true),
 ('eid-2027', 'Eid ul-Fitr', 'ईद', '2027-03-10', 10, 12, '{}', '{milk-based}', 1.4, '#8DC63F', '🌙', 'Eid Mubarak ji! Sheer khurma tayyar hai.', true),
 ('rakhi-2027', 'Raksha Bandhan', 'रक्षा बंधन', '2027-08-17', 14, 12, '{festive}', '{barfi,dry-fruit,bengali}', 1.6, '#E6197A', '🧵', 'Rakhi di mithai pehle se book karo ji!', true),
 ('janmashtami-2027', 'Janmashtami', 'जन्माष्टमी', '2027-08-25', 10, 12, '{}', '{milk-based}', 1.4, '#4B1D6B', '🦚', 'Nand ke anand bhayo! Makhan mishri te peda.', true),
 ('ganesh-2027', 'Ganesh Chaturthi', 'गणेश चतुर्थी', '2027-09-04', 10, 12, '{}', '{steamed,laddoo}', 1.5, '#FF9933', '🐘', 'Ganpati Bappa Morya! Modak taiyaar hai.', true),
 ('navratri-2027', 'Navratri begins', 'नवरात्रि', '2027-09-30', 10, 12, '{}', '{milk-based,halwa}', 1.3, '#E6197A', '🪷', 'Jai Mata Di! Vrat wali mithai bhi hai ji.', true)
on conflict (slug) do nothing;

-- Pickup / delivery slots for the festivals in the next ~6 weeks (festival day and the day before).
insert into public.preorder_slots (festival_id, slot_date, start_time, end_time, max_orders, max_kg)
select f.id, d::date, st::time, (st::time + interval '3 hours')::time,
       case when f.slug = 'deepawali-2026' then 25 else 15 end, case when f.slug = 'deepawali-2026' then 60 else 35 end
from public.festivals f
cross join lateral generate_series(f.starts_on - 1, f.starts_on, interval '1 day') d
cross join unnest(array['09:00','12:00','15:00','18:00']) st
where f.starts_on between public.shop_today() and public.shop_today() + 45
on conflict (festival_id, slot_date, start_time) do nothing;

-- ---------------------------------------------------------------- scratch card prizes (owner-editable)
insert into public.scratch_prizes (label, kind, value, sweet_id, grams, min_order, weight, cost_estimate, shayari)
select * from (values
  ('5% off your next order', 'percent', 5::numeric, null::bigint, null::int, 0::numeric, 30, 25::numeric, null::text),
  ('10% off your next order', 'percent', 10, null, null, 300, 14, 50, null),
  ('Free 250 g Kaju Katli on your next order', 'free_item', 0, (select id from public.sweets where name = 'Kaju Katli'), 250, 400, 6, 220, null),
  ('Free festive gift wrap', 'free_wrap', 0, null, null, 0, 14, 25, null),
  ('₹50 off on orders above ₹500', 'flat', 50, null, null, 500, 16, 50, null),
  ('Better luck next time', 'none', 0, null, null, 0, 20, 0, 'Is baar na sahi, agli baar pakka — mithaas toh har baar milegi ji!')
) as p(label, kind, value, sweet_id, grams, min_order, weight, cost_estimate, shayari)
where not exists (select 1 from public.scratch_prizes);

-- ---------------------------------------------------------------- mithai + namkeen pairing rules
insert into public.combo_rules (mithai_id, mithai_category, namkeen_id, reason, weight)
select m.id, r.cat, n.id, r.reason, r.w
from (values
  ('Kaju Katli', null, 'Aloo Bhujia', 'Kaju katli de naal bhujia — Deepawali di asli jodi!', 3.0),
  ('Jalebi', null, 'Samosa', 'Garam jalebi aur samosa — har subah ka raja combo', 3.0),
  ('Jalebi', null, 'Fafda', 'Jalebi-fafda: Gujarat aur Dussehra ka favourite', 2.6),
  ('Rasgulla', null, 'Mathri', 'Rasgulla ki mithaas, mathri ka namak — perfect balance', 2.2),
  ('Gulab Jamun', null, 'Dhokla', 'Gulab jamun ke saath spongy dhokla — mehmaanon ki pehli pasand', 2.4),
  ('Soan Papdi', null, 'Moong Dal Namkeen', 'Soan papdi aur moong dal — halka-phulka gift tin', 2.0),
  ('Gujiya', null, 'Namak Pare', 'Gujiya aur namak pare — tyohaar ki thaali poori', 2.4),
  ('Motichoor Laddoo', null, 'Aloo Bhujia', 'Motichoor aur bhujia — mehmaan khush!', 2.2),
  ('Imarti', null, 'Khasta Kachori', 'Imarti ke saath khasta kachori — UP wala nashta', 2.2),
  ('Rasmalai', null, 'Khandvi', 'Thandi rasmalai aur khandvi — halki-phulki dawat', 1.8),
  ('Besan Laddoo', null, 'Mathri', 'Besan laddoo aur mathri — chai ke saath dadi wala combo', 2.2),
  ('Kalakand', null, 'Khatta Meetha Mixture', 'Kalakand ke baad thoda khatta-meetha', 1.8),
  ('Gajar Ka Halwa', null, 'Pyaaz Kachori', 'Garam halwa aur pyaaz kachori — sardiyon ka sukh', 2.0),
  (null, 'barfi', 'Navratan Mixture', 'Barfi ke saath navratan — gifting ka classic', 1.4),
  (null, 'bengali', 'Nimki', 'Bengali mishti ke saath nimki — Kolkata style', 1.5),
  (null, 'laddoo', 'Namak Pare', 'Laddoo ke saath namak pare — Deepawali dabba', 1.4),
  (null, 'dry-fruit', 'Kaju Masala', 'Dry fruit mithai ke saath kaju masala — premium jodi', 1.3),
  (null, 'halwa', 'Kachori', 'Halwa-kachori — sabse purana nashta', 1.5),
  (null, 'milk-based', 'Khatta Meetha Mixture', 'Doodh wali mithai ke baad khatta-meetha', 1.2),
  (null, 'syrup-soaked', 'Samosa', 'Chashni wali mithai aur garam samosa', 1.4),
  (null, 'fried', 'Chana Jor Garam', 'Tali mithai ke saath chana jor garam', 1.0),
  (null, 'brittle', 'Masala Peanuts', 'Gajak-chikki ke saath masala moongphali — sardi special', 1.2),
  (null, 'world', 'Cornflakes Mixture', 'Videshi mithai, desi namkeen!', 0.8)
) as r(mithai, cat, namkeen, reason, w)
left join public.sweets m on m.name = r.mithai and m.product_type = 'mithai'
join public.sweets n on n.name = r.namkeen and n.product_type = 'namkeen'
where (r.mithai is null or m.id is not null)
  and not exists (select 1 from public.combo_rules);

-- ---------------------------------------------------------------- ready-made Jodi Boxes
create or replace function pg_temp.vid(p_name text, p_label text) returns bigint language sql as $$
  select v.id from public.sweet_variants v join public.sweets s on s.id = v.sweet_id
  where s.name = p_name order by (v.weight_label = p_label) desc, v.sort_order limit 1;
$$;
insert into public.jodi_boxes (name, description, items, discount_percent, emoji, sort_order)
select * from (values
  ('Deepawali Jodi', '500 g Kaju Katli + 250 g Aloo Bhujia', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.vid('Kaju Katli','500g'), 'qty', 1), jsonb_build_object('variant_id', pg_temp.vid('Aloo Bhujia','250g'), 'qty', 1)), 8.0, '🪔', 1),
  ('Dussehra Jodi', '250 g Jalebi + 250 g Fafda', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.vid('Jalebi','250g'), 'qty', 1), jsonb_build_object('variant_id', pg_temp.vid('Fafda','250g'), 'qty', 1)), 10.0, '🏹', 2),
  ('Chai-time Jodi', '250 g Besan Laddoo + 250 g Mathri', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.vid('Besan Laddoo','250g'), 'qty', 1), jsonb_build_object('variant_id', pg_temp.vid('Mathri','250g'), 'qty', 1)), 8.0, '☕', 3),
  ('Bengali Jodi', '500 g Rasgulla + 250 g Nimki', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.vid('Rasgulla','500g'), 'qty', 1), jsonb_build_object('variant_id', pg_temp.vid('Nimki','250g'), 'qty', 1)), 8.0, '🐟', 4),
  ('Mehmaan Jodi', '500 g Motichoor Laddoo + 500 g Navratan Mixture', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.vid('Motichoor Laddoo','500g'), 'qty', 1), jsonb_build_object('variant_id', pg_temp.vid('Navratan Mixture','500g'), 'qty', 1)), 8.0, '🏡', 5)
) as j(name, description, items, discount_percent, emoji, sort_order)
where not exists (select 1 from public.jodi_boxes);

-- ---------------------------------------------------------------- weather / time / day rules
insert into public.context_rules (condition, tags, categories, sweet_ids, boost, banner_title, paaji_line, icon, priority)
select r.cond, r.tags, r.cats, array(select id from public.sweets where name = any(r.names)), r.boost, r.title, r.line, r.icon, r.prio
from (values
  ('weather=cold', '{winter}'::text[], '{halwa}'::text[], array['Gajar Ka Halwa','Moong Dal Halwa','Gond Laddoo','Pinni','Gulab Jamun','Panjiri','Gur Gajak'], 1.0,
   'Thand hai ji! Garam halwe da time', 'Bahar thand hai ji — garma-garam gajar halwa te gulab jamun, sardi bhaga do!', '🧣', 10),
  ('weather=hot', '{summer}', '{}', array['Kulfi','Rabri','Shrikhand','Mishti Doi','Rasgulla','Phirni','Amrakhand','Kesar Shrikhand'], 1.0,
   'Garmi hai ji! Kuch thanda-meetha ho jaaye', 'Itni garmi vich thandi kulfi te rabri — dil nu thandak!', '☀️', 10),
  ('weather=rainy', '{}', '{}', array['Jalebi','Imarti','Samosa','Pyaaz Kachori','Kachori','Malpua'], 1.0,
   'Baarish aur garam jalebi — wah ji wah!', 'Baarish ho rahi hai ji — garam jalebi te samosa, isse vadiya kuch nahi!', '🌧️', 10),
  ('weather=humid', '{}', '{bengali}', array['Sandesh','Mishti Doi','Rasgulla','Chhena Poda'], 0.7,
   'Umas hai ji, halki mithai chalegi', 'Umas vich halka-phulka sandesh te mishti doi, bas!', '💧', 8),
  ('time=morning', '{}', '{}', array['Jalebi','Dhokla','Khaman','Kachori','Sooji Halwa'], 0.8,
   'Subah-subah garam jalebi?', 'Shubh prabhat ji! Nashte vich garam jalebi te dhokla?', '🌅', 5),
  ('time=afternoon', '{}', '{milk-based}', array['Rasmalai','Kulfi','Rabri','Kalakand'], 0.6,
   'Dopahar di meethi neend se pehle…', 'Khaane ke baad ek rasmalai? Bas ek!', '🍽️', 4),
  ('time=evening', '{chai-time}', '{barfi}', array['Mathri','Namak Pare','Samosa','Besan Barfi','Kaju Katli','Nimki'], 0.8,
   'Chai da time! Barfi te mathri?', 'Shaam di chai de naal barfi te mathri — mazaa aa jaayega!', '☕', 5),
  ('time=night', '{}', '{}', array['Sugar-free Kaju Katli','Sugar-free Besan Laddoo','Sugar-free Gulab Jamun','Sugar-free Rasgulla','Sugar-free Anjeer Roll','Makhana Masala'], 0.8,
   'Raat nu halka — sugar-free sujhaav', 'Raat ho gayi ji — halki, sugar-free mithai, neend bhi meethi!', '🌙', 5),
  ('time=late-night', '{}', '{}', array['Gulab Jamun','Fudge Brownie','Eggless Brownie','Rasgulla'], 0.6,
   'Late-night craving?', 'Itni raat nu bhookh? Ek gulab jamun, koi gal nahi!', '🦉', 4),
  ('day=weekend', '{}', '{}', array['Gulab Jamun','Rasgulla','Motichoor Laddoo','Kaju Katli'], 0.5,
   'Weekend hai! Poore parivaar layi', 'Weekend te parivaar — ek vadda dabba ho jaaye!', '🎉', 3),
  ('day=festival', '{festive}', '{}', '{}'::text[], 0.8,
   'Aaj tyohaar hai ji!', 'Tyohaar di shubhkaamnayein — festive mithai sab taaza hai!', '🪔', 9),
  ('day=festival-eve', '{festive}', '{dry-fruit}', '{}'::text[], 0.8,
   'Kal tyohaar hai — aaj hi le jao!', 'Kal tyohaar hai ji, aaj hi dabba pakka kar lo!', '🎁', 9)
) as r(cond, tags, cats, names, boost, title, line, icon, prio)
where not exists (select 1 from public.context_rules);

-- ---------------------------------------------------------------- today's fresh batches
insert into public.batches (sweet_id, made_at, quantity_kg, best_before, notes, source)
select s.id, least(((public.shop_today() + b.t::time) at time zone public.shop_tz()), now() - interval '20 minutes'), b.kg,
       least(((public.shop_today() + b.t::time) at time zone public.shop_tz()), now()) + make_interval(days => greatest(s.shelf_life_days, 1)),
       'Subah ki bhatti', 'seed'
from (values ('Jalebi','06:30',6.0), ('Rasgulla','07:00',8.0), ('Kalakand','07:30',5.0), ('Gulab Jamun','08:00',7.0),
             ('Gajar Ka Halwa','08:30',6.0), ('Samosa','09:00',4.0), ('Motichoor Laddoo','09:30',8.0), ('Rasmalai','10:00',5.0),
             ('Kaju Katli','10:30',10.0), ('Dhokla','11:00',3.0)) as b(name, t, kg)
join public.sweets s on s.name = b.name
where not exists (select 1 from public.batches where source = 'seed' and made_at::date >= public.shop_today() - 1);

-- Shelf stock (kg) for the sweets that can go on a last-hour deal.
update public.sweet_variants v set stock_qty = greatest(coalesce(v.stock_qty, 0), case v.weight_label when '250g' then 14 when '500g' then 6 when '1kg' then 3 else coalesce(v.stock_qty, 10) end)
from public.sweets s where s.id = v.sweet_id and s.name in ('Rasgulla','Rasmalai','Kalakand','Gulab Jamun','Jalebi','Gajar Ka Halwa','Cham cham','Chamcham','Mishti Doi','Sandesh','Rabri','Imarti','Malpua');

-- ---------------------------------------------------------------- 90 days of realistic order history
-- ~25–40 counter orders a day, more at weekends, spikes before festivals, slowly growing shop.
do $$
declare
  v_users uuid[]; v_day date; v_n int; v_i int; v_oid uuid; v_ts timestamptz; v_dow int; v_spike numeric; v_k int; v_sum numeric;
  v_today date := public.shop_today(); v_tz text := public.shop_tz();
  v_past date[] := array['2026-08-28','2026-09-04','2026-09-14','2026-10-11','2026-10-18','2026-10-20']::date[];
begin
  if exists (select 1 from public.orders where is_demo and order_type = 'regular') then return; end if;
  select array_agg(p.id) into v_users from public.profiles p join auth.users u on u.id = p.id where u.email like '%.demo@swaadsujhav.test';
  if v_users is null then return; end if;
  create temp table _w on commit drop as
    select s.id, s.is_festive, s.category, s.product_type,
           (case when s.product_type = 'namkeen' then 40 when s.country <> 'India' then 4 else 18 + least(s.popularity, 300) / 4.0 end)
           * case when s.name in ('Kaju Katli','Rasgulla','Gulab Jamun','Jalebi','Motichoor Laddoo','Samosa','Aloo Bhujia','Soan Papdi','Kalakand','Besan Laddoo','Rasmalai') then 4
                  when s.name in ('Gajar Ka Halwa','Imarti','Milk Cake','Peda','Barfi','Khoya Barfi','Rabri','Dhokla','Mathri','Namak Pare','Kachori','Balushahi') then 2 else 1 end as w
    from public.sweets s where s.in_stock;
  for v_day in select generate_series(v_today - 90, v_today, interval '1 day')::date loop
    v_dow := extract(dow from v_day);
    v_spike := case when exists (select 1 from unnest(v_past) f where f - v_day between 0 and 3) then 1.8 else 1 end
             * (1 + (v_day - (v_today - 90)) / 250.0);
    v_n := round((case when v_dow in (0, 6) then 34 when v_dow = 5 then 27 else 21 end) * v_spike * (0.85 + random() * 0.3));
    if v_day = v_today then
      v_n := floor(v_n * least(1, greatest(0, extract(epoch from (now() - ((v_today + time '09:00') at time zone v_tz))) / 46800.0)));
    end if;
    for v_i in 1..v_n loop
      v_ts := ((v_day + time '09:30') at time zone v_tz) + make_interval(mins => floor(random() * 720)::int);
      continue when v_ts > now();
      insert into public.orders (user_id, status, fulfilment, payment_method, delivery_slot, subtotal, discount, total, created_at, is_demo)
      values (v_users[1 + floor(random() * array_length(v_users, 1))::int], case when v_day < v_today then 'delivered' else 'placed' end,
              'pickup', 'pay_at_shop', 'Counter sale', 0, 0, 0, v_ts, true)
      returning id into v_oid;
      v_k := 1 + floor(random() * 2.6)::int;
      insert into public.order_items (order_id, sweet_id, variant_id, quantity, price, list_price)
      select v_oid, x.id, x.vid, x.qty, x.price, x.price from (
        select w.id, v.id as vid, v.price, 1 + floor(random() * random() * 3)::int as qty
        from (select * from _w order by -ln(greatest(random(), 1e-9)) / (w * case when is_festive and v_spike > 1.5 then 2.2 else 1 end) limit v_k) w
        cross join lateral (select vv.id, vv.price from public.sweet_variants vv where vv.sweet_id = w.id
                            order by case vv.weight_label when '500g' then random() * 0.5 when '1kg' then random() * 0.8 when '250g' then random() * 0.9 else random() * 1.4 end
                            limit 1) v
      ) x;
      select coalesce(sum(quantity * price), 0) into v_sum from public.order_items where order_id = v_oid;
      update public.orders set subtotal = v_sum, total = v_sum where id = v_oid;
    end loop;
  end loop;
end $$;

-- End-of-day counter stock (what is really left on the shelf), deal-eligible sweets a bit more.
update public.sweet_variants set stock_qty = case weight_label
    when '250g' then floor(random() * 5)::int when '500g' then floor(random() * 3)::int when '1kg' then floor(random() * 2)::int
    when '1 pc' then 8 + floor(random() * 20)::int else 1 + floor(random() * 4)::int end
where stock_qty is not null;
update public.sweet_variants v set stock_qty = case v.weight_label when '250g' then 6 when '500g' then 2 when '1kg' then 1 else v.stock_qty end
from public.sweets s where s.id = v.sweet_id and s.name in ('Rasgulla','Rasmalai','Kalakand','Gulab Jamun','Jalebi','Gajar Ka Halwa','Chamcham','Mishti Doi','Sandesh','Rabri','Imarti','Malpua');
update public.sweet_variants v set stock_qty = 3
where v.weight_label = '250g' and v.stock_qty = 0 and not exists (select 1 from public.sweet_variants x where x.sweet_id = v.sweet_id and (x.stock_qty is null or x.stock_qty > 0));
update public.sweets s set in_stock = exists (select 1 from public.sweet_variants v where v.sweet_id = s.id and (v.stock_qty is null or v.stock_qty > 0));

-- Photos that matched the name but not the food (a person, a temple, a factory…) → designed placeholder.
update public.sweets set image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Sandesh_3.jpg/960px-Sandesh_3.jpg' where name = 'Sandesh';
update public.sweets set image_url = null, image_credit = null
where name in ('Palkova','Ghari','Dilkhush','Tirunelveli Halwa','Conchas','Coconut Laddoo','Gond Laddoo','Milk Cake','Kunda','Paan Laddoo','Sakkarai Pongal','Mawa Kachori');
update public.sweets set image_url = (select image_url from public.sweets where name = 'Balushahi') where name = 'Badusha';

-- Festival pre-orders already booked (they feed tomorrow's plan and the owner summary).
do $$
declare v_users uuid[]; r record; v_oid uuid; v_sum numeric; v_kg numeric; i int := 0;
begin
  if exists (select 1 from public.orders where is_demo and order_type = 'preorder') then return; end if;
  select array_agg(p.id) into v_users from public.profiles p join auth.users u on u.id = p.id where u.email like '%.demo@swaadsujhav.test';
  for r in select ps.*, f.name as fname from public.preorder_slots ps join public.festivals f on f.id = ps.festival_id
           where f.slug in ('dhanteras-2026', 'deepawali-2026', 'karwa-chauth-2026') order by ps.slot_date, ps.start_time loop
    for k in 1..(case when r.start_time = '18:00' then 4 else 2 end) loop
      i := i + 1;
      insert into public.orders (user_id, status, fulfilment, payment_method, delivery_slot, subtotal, discount, total, order_type,
                                 scheduled_for, festival_id, preorder_slot_id, created_at, is_demo)
      values (v_users[1 + (i % array_length(v_users, 1))], 'placed', 'pickup', 'pay_at_shop',
              format('%s · %s, %s', r.fname, to_char(r.slot_date, 'Dy DD Mon'), to_char(r.start_time, 'HH12:MIam')),
              0, 0, 0, 'preorder', (r.slot_date + r.start_time) at time zone public.shop_tz(), r.festival_id, r.id,
              now() - make_interval(hours => 2 + i * 3), true)
      returning id into v_oid;
      insert into public.order_items (order_id, sweet_id, variant_id, quantity, price, list_price)
      select v_oid, s.id, v.id, 1 + (random() < 0.3)::int, v.price, v.price
      from public.sweets s join lateral (select vv.id, vv.price from public.sweet_variants vv where vv.sweet_id = s.id order by (vv.weight_label = '1kg') desc, vv.sort_order limit 1) v on true
      where s.name = any(array['Kaju Katli','Motichoor Laddoo','Soan Papdi','Dry Fruit Laddoo','Rasgulla','Aloo Bhujia','Badam Barfi'])
      order by random() limit 2 + (i % 2);
      select coalesce(sum(oi.quantity * oi.price), 0), coalesce(sum(oi.quantity * public.variant_grams(v.weight_label, v.grams)), 0) / 1000.0
        into v_sum, v_kg from public.order_items oi join public.sweet_variants v on v.id = oi.variant_id where oi.order_id = v_oid;
      update public.orders set subtotal = v_sum, total = v_sum where id = v_oid;
      update public.preorder_slots set booked_orders = booked_orders + 1, booked_kg = booked_kg + v_kg where id = r.id;
    end loop;
  end loop;
  -- One Deepawali evening slot almost full, to show capacity in action.
  update public.preorder_slots ps set booked_orders = ps.max_orders - 1
  from public.festivals f where f.id = ps.festival_id and f.slug = 'deepawali-2026' and ps.slot_date = f.starts_on - 1 and ps.start_time = '18:00';
end $$;

-- ---------------------------------------------------------------- waste log (8 weeks, falling since the app)
insert into public.waste_logs (log_date, kg, value, note)
select d::date, round((3.6 - 2.2 * (d::date - (public.shop_today() - 56)) / 56.0 + random() * 0.8)::numeric, 1),
       round((3.6 - 2.2 * (d::date - (public.shop_today() - 56)) / 56.0) * 380), 'Closing count'
from generate_series(public.shop_today() - 56, public.shop_today() - 1, interval '1 day') d
where not exists (select 1 from public.waste_logs);
update public.waste_logs set value = round(kg * 380) where note = 'Closing count';

-- ---------------------------------------------------------------- demo coupon + gift plan for Priya (customer demo account)
do $$
declare v_uid uuid; v_plan bigint; r record; v_box bigint;
begin
  select id into v_uid from auth.users where email = 'priya.demo@swaadsujhav.test';
  if v_uid is null or exists (select 1 from public.gift_plans where user_id = v_uid) then return; end if;
  insert into public.coupons (code, user_id, kind, value, min_order, label, source, expires_at)
  values ('SSDEMO10', v_uid, 'percent', 10, 300, '10% off your next order', 'admin', '2026-11-30')
  on conflict (code) do nothing;
  insert into public.gift_plans (user_id, title, occasion, budget_mode, budget, sender_name)
  values (v_uid, 'Deepawali 2026 — family & office', 'diwali', 'total', 4000, 'Priya') returning id into v_plan;
  for r in select * from (values
      (1, 'Mausi ji', 'Mausi', 2, '{"sugar_free":true}'::jsonb, 'very', '4 pc', array['Sugar-free Kaju Katli','Sugar-free Anjeer Roll'], 'Sugar-free kyunki Mausi ji meetha kam khaati hain'),
      (2, 'Chacha ji ki family', 'Chacha''s family', 5, '{"loves_dry_fruit":true,"wants_namkeen":true}', 'normal', '1kg', array['Kaju Katli','Badam Barfi','Kaju Masala'], 'Dry fruit pasand hai, aur namkeen bhi'),
      (3, 'Sharma ji (Boss)', 'Boss', 3, '{"loves_bengali":true}', 'very', '9 pc', array['Rasmalai','Kesar Chamcham','Sandesh'], 'Bengali mithai — boss ki pasand'),
      (4, 'Gupta ji ke bachche', 'Neighbours', 4, '{"kids":true}', 'token', '250g', array['Motichoor Laddoo','Moong Dal Namkeen'], 'Bachchon ke liye laddoo aur halka namkeen'),
      (5, 'Office team', 'Office team', 8, '{"wants_namkeen":true}', 'normal', '1kg', array['Soan Papdi','Aloo Bhujia'], 'Poori team ke liye share karne layak')
    ) as x(ord, name, relation, hh, prefs, imp, size, sweets, why) loop
    insert into public.gift_recipients (plan_id, name, relation, household, prefs, importance, deliver_self, deliver_on, sort_order)
    values (v_plan, r.name, r.relation, r.hh, r.prefs, r.imp, true, '2026-11-07', r.ord);
    insert into public.gift_boxes (plan_id, recipient_id, size_label, reasons)
    values (v_plan, currval(pg_get_serial_sequence('public.gift_recipients', 'id')), r.size, array[r.why]) returning id into v_box;
    insert into public.gift_box_items (box_id, sweet_id, variant_id, qty, reason)
    select v_box, s.id, v.id, 1, r.why from public.sweets s
    join lateral (select vv.id from public.sweet_variants vv where vv.sweet_id = s.id
                  order by (vv.weight_label = case when r.size like '%pc' then '250g' when r.size = '1kg' then '500g' else '250g' end) desc, vv.sort_order limit 1) v on true
    where s.name = any(r.sweets);
  end loop;
  update public.gift_boxes b set price = public.gift_box_total(b.id) where b.plan_id = v_plan;
end $$;
