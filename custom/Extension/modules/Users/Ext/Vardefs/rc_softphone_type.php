<?php
if (!defined('sugarEntry') || !sugarEntry) {
    die('Not A Valid Entry Point');
}

$dictionary['User']['fields']['rc_softphone_type_c'] = array(
    'name' => 'rc_softphone_type_c',
    'vname' => 'LBL_RC_SOFTPHONE_TYPE',
    'type' => 'enum',
    'dbType' => 'varchar',
    'len' => 20,
    'options' => 'rc_softphone_type_dom',
    'default' => '',
    'source' => 'custom_fields',
    'comment' => 'Which RingCentral softphone widget (RingCX or RingEX) this user gets in the SuiteCRM frontend',
);
