<?php
if (!defined('sugarEntry') || !sugarEntry) {
    die('Not A Valid Entry Point');
}

global $current_user;

header('Content-Type: application/json');

if (empty($current_user->id)) {
    http_response_code(401);
    echo json_encode(array('error' => 'unauthenticated'));
    sugar_cleanup(true);
}

$type = (string) ($current_user->rc_softphone_type_c ?? '');
if (!in_array($type, array('ringcx', 'ringex'), true)) {
    $type = '';
}

echo json_encode(array('type' => $type));
sugar_cleanup(true);
