module.exports=`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    <h1>{{currentPath}}</h1>
    <ul>
        {{#fileList}}
        <li> 
            <a href="{{filePath}}">{{fileName}}</a>
        </li>
        {{/fileList}}
    </ul>
</body>
</html>`